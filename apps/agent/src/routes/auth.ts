import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";
import {
  DEMO_USER_ID,
  GMAIL_SCOPES,
  getAccessToken,
  getOAuthClient,
  getTokens,
  isGmailConfigured,
  saveTokens,
} from "../lib/gmail.js";

export const authRouter: Router = createRouter();

/**
 * GET /auth/google/start — redirects the user to Google's consent screen.
 * On success, Google calls /auth/google/callback with a code we exchange.
 */
authRouter.get("/auth/google/start", (_req: Request, res: Response) => {
  if (!isGmailConfigured()) {
    return res.status(503).json({
      error: "gmail_not_configured",
      detail:
        "Set GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REDIRECT_URI on the agent service to enable real Gmail send.",
    });
  }
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent", // force refresh_token issuance on every connect
    include_granted_scopes: true,
  });
  return res.redirect(url);
});

/**
 * GET /auth/google/callback — exchanges the code for tokens, fetches the
 * user's email via the userinfo endpoint, persists, then redirects back to
 * the web app's /actions page.
 */
authRouter.get("/auth/google/callback", async (req: Request, res: Response) => {
  if (!isGmailConfigured()) return res.status(503).send("Gmail not configured.");
  const code = typeof req.query["code"] === "string" ? req.query["code"] : undefined;
  if (!code) return res.status(400).send("Missing code.");

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return res.status(400).send("Token exchange failed — no access_token or refresh_token returned.");
    }

    // Fetch the connected email via userinfo
    const ui = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    let email = "unknown@unknown";
    if (ui.ok) {
      const j = (await ui.json()) as { email?: string };
      if (typeof j.email === "string") email = j.email;
    }

    await saveTokens({
      userId: DEMO_USER_ID,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry: tokens.expiry_date ?? Date.now() + 3500 * 1000,
      scope: tokens.scope ?? GMAIL_SCOPES.join(" "),
      email,
    });

    // Redirect back to the web app. Use the FRONTEND_URL env if set; otherwise just send a confirmation page.
    const frontend = process.env.MNEMOS_WEB_URL || process.env.FRONTEND_URL;
    if (frontend) {
      return res.redirect(`${frontend}/actions?connected=gmail`);
    }
    return res
      .status(200)
      .setHeader("Content-Type", "text/html")
      .send(
        `<!doctype html><html><body style="font-family:system-ui;padding:48px;max-width:560px;background:#0e0a05;color:#f3ecdf"><h1 style="font-family:Georgia,serif;font-style:italic;color:#f25738">Gmail connected.</h1><p>You're connected as <strong>${email}</strong>. You can close this tab and return to Mnemos.</p></body></html>`,
      );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).send(`OAuth callback error: ${msg}`);
  }
});

/**
 * GET /auth/google/status — returns whether the demo user has Gmail
 * tokens and whether the env is configured. Used by the web UI to
 * decide if it should show 'Connect Gmail' or 'Connected'.
 */
authRouter.get("/auth/google/status", async (_req: Request, res: Response) => {
  const configured = isGmailConfigured();
  if (!configured) {
    return res.json({ configured: false, connected: false });
  }
  try {
    const tokens = await getTokens(DEMO_USER_ID);
    if (!tokens) return res.json({ configured: true, connected: false, calendar: false });
    // Try a refresh to confirm the token is still valid
    const accessToken = await getAccessToken(DEMO_USER_ID);
    return res.json({
      configured: true,
      connected: !!accessToken,
      // whether the granted scope includes Google Calendar
      calendar: !!accessToken && /calendar/.test(tokens.scope),
      email: tokens.email,
    });
  } catch (err) {
    return res.status(500).json({
      configured: true,
      connected: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /auth/google/disconnect — wipes the tokens for the demo user.
 */
authRouter.post("/auth/google/disconnect", async (_req: Request, res: Response) => {
  if (!isGmailConfigured()) {
    return res.status(503).json({ error: "gmail_not_configured" });
  }
  try {
    const { tokensCol } = await import("../lib/gmail.js");
    const col = await tokensCol();
    await col.deleteOne({ userId: DEMO_USER_ID });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
