import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Firebase ID-token verification with zero extra dependencies.
 *
 * Firebase ID tokens are RS256 JWTs signed by Google's secure-token service.
 * We verify them by hand: fetch Google's public x509 certs, check the RS256
 * signature against the cert named by the token's `kid`, then validate the
 * issuer / audience / expiry claims.
 *
 * Config-gated: if FIREBASE_PROJECT_ID isn't set, isFirebaseConfigured() is
 * false and the middleware is a no-op — the app runs open (demo behaviour).
 * When configured, mutating/agent requests must carry a valid Bearer token.
 */

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

function projectId(): string {
  return process.env["FIREBASE_PROJECT_ID"] || process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"] || "";
}

export function isFirebaseConfigured(): boolean {
  return projectId().length > 0;
}

export interface FirebaseUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

// ── cert cache ──
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && certCache.expiresAt > now) return certCache.certs;
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error(`firebase: failed to fetch certs (${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  // honour max-age so we refresh roughly when Google rotates keys
  const cc = res.headers.get("cache-control") ?? "";
  const m = /max-age=(\d+)/.exec(cc);
  const maxAgeMs = m && m[1] ? Number(m[1]) * 1000 : 3600_000;
  certCache = { certs, expiresAt: now + maxAgeMs };
  return certs;
}

function b64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function b64urlToJson<T>(s: string): T {
  return JSON.parse(b64urlToBuffer(s).toString("utf8")) as T;
}

export async function verifyFirebaseToken(token: string): Promise<FirebaseUser> {
  const pid = projectId();
  if (!pid) throw new Error("firebase: not configured");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("firebase: malformed token");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = b64urlToJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== "RS256") throw new Error("firebase: unexpected alg");
  if (!header.kid) throw new Error("firebase: missing kid");

  const certs = await getCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error("firebase: no matching public cert");

  // Verify the RS256 signature against the x509 cert's public key.
  const publicKey = new crypto.X509Certificate(cert).publicKey;
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    b64urlToBuffer(sigB64),
  );
  if (!ok) throw new Error("firebase: bad signature");

  const payload = b64urlToJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== pid) throw new Error("firebase: wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${pid}`) throw new Error("firebase: wrong issuer");
  if (!payload.sub) throw new Error("firebase: missing subject");
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) throw new Error("firebase: token expired");
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) throw new Error("firebase: token issued in the future");

  return {
    uid: payload.sub,
    ...(payload.email ? { email: payload.email } : {}),
    ...(payload.email_verified !== undefined ? { emailVerified: payload.email_verified } : {}),
    ...(payload.name ? { name: payload.name } : {}),
  };
}

function bearer(req: Request): string | null {
  const h = req.headers["authorization"];
  if (typeof h !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m && m[1] ? m[1] : null;
}

/**
 * Express middleware. No-op when Firebase isn't configured. When it is,
 * read-only (GET/HEAD/OPTIONS) and /auth/* requests pass through, but every
 * mutating/agent request must carry a valid Firebase ID token.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isFirebaseConfigured()) return next();

  const method = req.method.toUpperCase();
  const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";
  const isAuthRoute = req.path.startsWith("/auth") || req.path === "/health" || req.path === "/ready";

  const token = bearer(req);
  // Always attach the user when a valid token is present (even on reads).
  if (token) {
    try {
      (req as Request & { user?: FirebaseUser }).user = await verifyFirebaseToken(token);
      return next();
    } catch (err) {
      // An explicitly-bad token is always rejected.
      res.status(401).json({ error: "unauthorized", detail: err instanceof Error ? err.message : String(err) });
      return;
    }
  }

  if (isRead || isAuthRoute) return next();

  res.status(401).json({ error: "unauthorized", detail: "missing Firebase ID token" });
}
