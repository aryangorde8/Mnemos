import { OAuth2Client } from "google-auth-library";
import { type Collection } from "mongodb";
import { getDb } from "./mongo.js";

/**
 * Gmail send integration — opt-in by env vars.
 *
 * Required env to enable real sending:
 *   GMAIL_OAUTH_CLIENT_ID
 *   GMAIL_OAUTH_CLIENT_SECRET
 *   GMAIL_OAUTH_REDIRECT_URI   (e.g. https://mnemos-agent.aryangorde.com/auth/google/callback)
 *
 * If any of these are missing, isGmailConfigured() returns false and the
 * approval flow falls back to simulated send (existing behaviour). This
 * means we can ship the code without breaking the demo.
 *
 * Per-user tokens are stored in mongo `gmail_tokens` keyed by userId.
 * For the single-user demo we hardcode userId = "alex".
 */

export const DEMO_USER_ID = "alex";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export interface GmailTokenRecord {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiry: number; // ms epoch
  scope: string;
  email: string;
  updatedAt: Date;
}

export function isGmailConfigured(): boolean {
  return (
    !!process.env.GMAIL_OAUTH_CLIENT_ID &&
    !!process.env.GMAIL_OAUTH_CLIENT_SECRET &&
    !!process.env.GMAIL_OAUTH_REDIRECT_URI
  );
}

export function getOAuthClient(): OAuth2Client {
  if (!isGmailConfigured()) {
    throw new Error("Gmail OAuth env vars not configured");
  }
  return new OAuth2Client({
    clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
    clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI,
  });
}

export async function tokensCol(): Promise<Collection<GmailTokenRecord>> {
  const db = await getDb();
  return db.collection<GmailTokenRecord>("gmail_tokens");
}

export async function saveTokens(rec: Omit<GmailTokenRecord, "updatedAt">): Promise<void> {
  const col = await tokensCol();
  await col.updateOne(
    { userId: rec.userId },
    { $set: { ...rec, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function getTokens(userId: string): Promise<GmailTokenRecord | null> {
  const col = await tokensCol();
  return col.findOne({ userId });
}

/**
 * Returns a usable access token for the user — refreshes if expired.
 * Returns null if the user has no tokens, the OAuth env isn't configured,
 * or the refresh fails.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  if (!isGmailConfigured()) return null;
  const rec = await getTokens(userId);
  if (!rec) return null;

  const NOW = Date.now();
  // 60-second freshness buffer
  if (rec.expiry > NOW + 60_000) return rec.accessToken;

  // Refresh
  try {
    const client = getOAuthClient();
    client.setCredentials({ refresh_token: rec.refreshToken });
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) return null;
    const newRec: Omit<GmailTokenRecord, "updatedAt"> = {
      userId: rec.userId,
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? rec.refreshToken,
      expiry: credentials.expiry_date ?? NOW + 3500 * 1000,
      scope: credentials.scope ?? rec.scope,
      email: rec.email,
    };
    await saveTokens(newRec);
    return newRec.accessToken;
  } catch {
    return null;
  }
}

/**
 * Send an email via the Gmail API. Returns the message id on success.
 * Throws on any send-side error so the caller can surface it.
 */
export async function sendGmail(
  userId: string,
  message: { to: string[]; cc?: string[]; subject: string; body: string },
): Promise<{ messageId: string; threadId?: string; sentAs: string }> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) throw new Error("gmail not connected — open /auth/google/start to authorize");

  const fromAddress = (await getTokens(userId))?.email ?? "me";

  // RFC 822 MIME
  const lines = [
    `To: ${message.to.join(", ")}`,
    ...(message.cc && message.cc.length > 0 ? [`Cc: ${message.cc.join(", ")}`] : []),
    `From: ${fromAddress}`,
    `Subject: ${message.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message.body,
  ];
  const raw = base64url(lines.join("\r\n"));

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`gmail.send ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { id: string; threadId?: string };
  return { messageId: data.id, ...(data.threadId ? { threadId: data.threadId } : {}), sentAs: fromAddress };
}

function base64url(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
