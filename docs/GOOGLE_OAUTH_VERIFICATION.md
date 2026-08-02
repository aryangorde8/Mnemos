# Google OAuth verification — submission pack

Everything needed to remove the "Google hasn't verified this app" interstitial.
The app requests two **sensitive** scopes (`gmail.send`, `calendar.events`), so
verification is the only way to clear that screen — publishing to Production does
not, and test users in Testing mode still see it.

> Neither scope is **restricted**. `gmail.readonly` / `gmail.modify` / `mail.google.com`
> are the restricted Gmail scopes and would additionally require a paid annual CASA
> security assessment. Mnemos deliberately requests none of them, so standard brand
> review is all that applies. **If you ever add a read scope, that changes.**

---

## 1. Before you submit

| Requirement | Status | Where |
|---|---|---|
| Privacy policy, publicly reachable, same domain | ✅ built | `https://mnemos.aryangorde.com/privacy` |
| Terms of service | ✅ built | `https://mnemos.aryangorde.com/terms` |
| Homepage explaining the app, no login wall | ✅ exists | `https://mnemos.aryangorde.com/` |
| Links reachable from inside the app | ✅ built | nav rail footer |
| Domain ownership verified | ⬜ you | Search Console, §2 |
| App logo 120×120 | ⬜ you | §3 |
| Demo video | ⬜ you | §5 |
| Scope justifications | ✅ written | §4 — paste as-is |

Check the two pages are actually reachable from outside your network before
submitting — a reviewer hitting a 404 or a login wall is an instant rejection:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mnemos.aryangorde.com/privacy
curl -sS -o /dev/null -w '%{http_code}\n' https://mnemos.aryangorde.com/terms
```

Both must print `200`.

---

## 2. Verify the domain

1. <https://search.google.com/search-console> → **Add property** → **Domain** → `aryangorde.com`
2. Add the TXT record it gives you at your DNS provider, then **Verify**
3. Use the **same Google account** that owns the Cloud project — verification will
   not be credited otherwise
4. In Google Auth Platform → **Branding** → **Authorised domains**, confirm
   `aryangorde.com` is listed

---

## 3. Branding values

| Field | Value |
|---|---|
| App name | `Mnemos` |
| User support email | `aryangorde8@gmail.com` |
| App logo | 120×120 PNG, no rounded corners (Google crops its own) |
| Application home page | `https://mnemos.aryangorde.com/` |
| Privacy policy link | `https://mnemos.aryangorde.com/privacy` |
| Terms of service link | `https://mnemos.aryangorde.com/terms` |
| Authorised domain | `aryangorde.com` |
| Developer contact | `aryangorde8@gmail.com` |

The app name must match what the video and the pages say. A mismatch between
"Mnemos" here and a different name on screen gets flagged.

---

## 4. Scope justifications — paste these

Reviewers reject vague answers. Each one names the exact user-visible action, and
says what the scope does **not** allow.

**`https://www.googleapis.com/auth/gmail.send`**

> Mnemos drafts an email on the user's behalf from their own document corpus and
> displays the full draft for review. A second reviewing agent annotates it for
> unsupported claims. Nothing is transmitted until the user presses "approve &
> send" on that specific draft. This scope is used solely to deliver that one
> approved message. We do not request read access, so the application cannot open,
> list, search, or ingest the user's mailbox — send is the only Gmail capability it
> has. A narrower scope does not exist for sending mail.

**`https://www.googleapis.com/auth/calendar.events`**

> Used for two user-initiated actions. First, when proposing meeting times, Mnemos
> queries free/busy for the proposed windows so it can show the user which slots
> conflict with existing commitments before they choose. Second, when the user
> approves a specific proposed time, it creates that single calendar event with the
> attendees and agenda shown on screen. No event is created, modified, or deleted
> without the user approving that exact proposal. `calendar.events` is the narrowest
> scope that permits creating an event; `calendar.readonly` would not allow it.

**`https://www.googleapis.com/auth/userinfo.email`**

> Displayed in the application header so the user can see which Google account is
> currently connected, and therefore which account an approved send or booking would
> act on. Multiple people may use the deployment, so showing the connected address
> prevents someone acting on an account they did not intend.

**`openid`**

> The Google account identifier is the key each user's stored connection is filed
> under, which is what keeps one user's connection from being visible or usable by
> another visitor. It is not used for profiling.

**If asked "why do you need to store refresh tokens":**

> The approval step is deliberately separated from drafting — a user may review and
> approve an action minutes or hours after it was proposed. A refresh token allows
> that approved action to complete without forcing the user to re-authenticate at the
> moment of approval. Tokens are deleted immediately when the user disconnects.

---

## 5. Demo video

**Recorded 2026-08-01** — <https://youtu.be/ekoeUG7W8zE> (4:03), titled
`Mnemos — OAuth Verification Demo (gmail.send, calendar.events)`.

Confirmed playable by an unauthenticated fetch (`playabilityStatus: OK`, oEmbed 200),
which is the check that matters: "inaccessible video link" is a listed rejection
reason, and a *Private* video looks fine to its owner and unplayable to everyone else.
Keep it **Unlisted** — reviewers can watch it, search cannot index the consent screen,
the connected address, or the corpus contents shown on screen.

Reviewers need to see the **OAuth consent screen itself** and **each scope being
used**. No narration required, but keep it unhurried.

Shot list:

1. **The app, signed out** — `https://mnemos.aryangorde.com/`, showing the Google
   status as not connected
2. **The full OAuth flow** — click Connect, and record the *entire* Google screen
   including the URL bar showing `accounts.google.com`, the account chooser, and the
   consent screen with both permission checkboxes visible. Do not cut this short;
   this is the single most important shot.
3. **Back in the app**, showing the connected account's email address
4. **`gmail.send` in use** — ask Mnemos to draft an email, show the draft and the
   critic's notes, press approve, then show the sent message in Gmail
5. **`calendar.events` in use** — ask it to schedule a meeting, show the proposed
   slots with conflicts flagged (that is the free/busy read), approve one, then show
   the created event in Google Calendar
6. **Disconnect** — show the token being removed and the app returning to not
   connected

Record at 1280×720 or better, and make sure on-screen text is legible.

---

## 6. Submit

Two reviews, in order. **Branding must be published before data access can be
requested** — they are not parallel, and the second gate stays shut until the first
clears.

### Where this stands (2026-08-02)

| Gate | State |
|---|---|
| Branding | Appeal submitted — "the finding is incorrect", both findings |
| Data access | Not started — scope table is empty |
| Demo video | Recorded, on YouTube, not yet attached |

The branding checker twice returned `home page does not explain the purpose` and
`app name ... does not match` against a page that demonstrably says both. Verified
against the live site with a Googlebot user-agent: HTTP 200, no redirect, no
`robots.txt` restriction, name in `<title>`/`<h1>`/`application-name`/`og:site_name`,
purpose in `<meta name="description">` and in the body. Other developers report the
same loop, so the appeal argues the finding is wrong rather than re-fixing a correct
page. If it stalls: removing the app logo drops the branding-verification requirement
altogether, at the cost of a plain consent screen.

### Then

Google Auth Platform → **Verification Center** → **Prepare for verification**.
Fill in the branding, attach the video URL, paste the justifications, submit.

Expect **days to several weeks**, usually with at least one round of follow-up
questions. Answer them in the same thread; a slow reply restarts the clock.

Until it clears, the app keeps working — users click **Advanced → Go to
aryangorde.com** and consent as normal. Verification removes the screen; it is not
required for function.

---

## 7. Keep this true

The privacy policy in [apps/web-py/surfaces/legal.py](../apps/web-py/surfaces/legal.py)
describes the scopes and storage the code actually uses. If `GMAIL_SCOPES` in
[apps/agent-py/app/lib/gmail.py](../apps/agent-py/app/lib/gmail.py) changes, or the
app starts storing something new, update that page in the same commit — a policy
that no longer matches the app's behaviour is grounds for revoking an approved
verification.
