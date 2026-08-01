"""Privacy policy + terms — required for Google OAuth verification.

Google's reviewers fetch these URLs directly and check that they are publicly
reachable (no auth wall), on the same domain as the app's authorized domain, and
that the privacy policy actually describes the Google user data the requested
scopes touch. Everything here must stay TRUE of the running code — if the scopes
or the storage change, change this text in the same commit.
"""
from fasthtml.common import A, Div, H2, Li, P, Span, Ul  # type: ignore

from chrome import page, surface_head

# Keep in step with GMAIL_SCOPES in apps/agent-py/app/lib/gmail.py.
SCOPES = [
    ("https://www.googleapis.com/auth/gmail.send",
     "Send an email that you have reviewed and approved.",
     "Mnemos drafts an email and shows it to you. Nothing is sent unless you press "
     "approve. This scope cannot read, list, or search your mailbox."),
    ("https://www.googleapis.com/auth/calendar.events",
     "Create a calendar event you approved, and check the proposed time for conflicts.",
     "Before proposing a time, Mnemos asks Google whether you are busy in that window "
     "so it can flag clashes. On approval it creates the event."),
    ("https://www.googleapis.com/auth/userinfo.email",
     "Show which Google account is connected.",
     "Displayed in the header so you can tell whose account an action would use."),
    ("openid",
     "Identify your session.",
     "Your Google account id is the key your connection is stored under, so your "
     "connection stays yours and is never shared with another visitor."),
]

_UPDATED = "1 August 2026"


def _section(title, *body):
    return Div(H2(title, cls="surface-h1", style="font-size:24px;margin:34px 0 10px"), *body)


def _p(*content):
    return P(*content, cls="muted", style="max-width:74ch;margin:0 0 12px;line-height:1.7")


def _ul(items):
    return Ul(*[Li(i, cls="muted", style="margin:0 0 7px;line-height:1.65") for i in items],
              style="max-width:74ch;margin:0 0 12px;padding-left:20px")


def render_privacy(ready=None, vault=None):
    body = Div(
        surface_head("—", "legal · privacy",
                     Span("Privacy "), Span("policy.", cls="i accent")),
        _p(Span(f"Last updated {_UPDATED}.", cls="chrome")),
        _p("Mnemos is a personal-memory agent. It reads a corpus of professional "
           "documents, answers questions about them with citations, and drafts emails and "
           "meetings for you to approve. This page describes exactly what data it holds and "
           "why."),

        _section("Google user data we access",
            _p("Connecting your Google account is optional. Mnemos works without it — "
               "proposed emails and meetings are simply recorded as simulated instead of "
               "being sent. If you do connect, these are the scopes requested and the only "
               "purposes they are used for:"),
            Div(*[Div(Div(scope, cls="mono", style="font-size:13px;color:var(--accent)"),
                      Div(purpose, style="margin:3px 0 3px"),
                      Div(detail, cls="muted", style="font-size:14px;line-height:1.6"),
                      style="margin:0 0 16px;padding-left:14px;"
                            "border-left:2px solid var(--paper-faint)")
                  for scope, purpose, detail in SCOPES],
                style="max-width:74ch;margin:14px 0 6px"),
            _p(Span("Mnemos does not request read access to your mailbox.", cls="accent"),
               " There is no gmail.readonly, gmail.modify, or Drive scope. It cannot open, "
               "search, or ingest your email. The only Gmail action it can take is sending "
               "a message you have explicitly approved.")),

        _section("What we store",
            _ul([
                "Your Google account identifier and email address, used to keep your "
                "connection separate from other users'.",
                "OAuth access and refresh tokens, so an approved action can be carried out "
                "without asking you to sign in again.",
                "The emails and meetings Mnemos proposes to you, the question that produced "
                "them, and the reviewing agent's notes on each draft.",
                "A session cookie that identifies your browser. It contains your Google "
                "account id and email, is signed, and expires after 30 days.",
            ]),
            _p("Data is stored in MongoDB Atlas. The demo corpus Mnemos answers questions "
               "over is fictional sample data and contains no information from your account.")),

        _section("What we never do",
            _ul([
                "We do not read your mailbox, Drive, or contacts.",
                "We do not send email or create events without your explicit approval.",
                "We do not sell, rent, or share your data with third parties for advertising.",
                "We do not use your Google user data to train machine-learning models.",
                "We do not show one user's connection, drafts, or account to another user.",
            ])),

        _section("Processors",
            _p("Mnemos passes text to these services in order to function:"),
            _ul([
                "Amazon Web Services (Bedrock) — generates the agent's reasoning and "
                "embeddings. Content of the drafts and questions is sent for inference.",
                "MongoDB Atlas — stores everything described above.",
                "Google APIs — only to perform the send and calendar actions you approve.",
            ])),

        _section("Retention and deletion",
            _p("Disconnecting removes your stored Google tokens immediately, and Mnemos "
               "loses the ability to act on your account from that moment. You can "
               "disconnect at any time from the app, and you can revoke Mnemos's access "
               "directly at ",
               A("myaccount.google.com/permissions", href="https://myaccount.google.com/permissions",
                 target="_blank", rel="noopener", cls="accent"), "."),
            _p("To have proposed actions and any remaining records deleted, email the "
               "address below and they will be removed.")),

        _section("Limited Use disclosure",
            _p("Mnemos's use and transfer of information received from Google APIs adheres "
               "to the ",
               A("Google API Services User Data Policy",
                 href="https://developers.google.com/terms/api-services-user-data-policy",
                 target="_blank", rel="noopener", cls="accent"),
               ", including the Limited Use requirements.")),

        _section("Contact",
            _p("Questions, deletion requests, or security reports: ",
               A("aryangorde8@gmail.com", href="mailto:aryangorde8@gmail.com", cls="accent"), ".")),

        P(A("Terms of service →", href="/terms", cls="accent"),
          style="margin-top:36px"),
    )
    return page("privacy", body, ready=ready or {}, vault=vault or {})


def render_terms(ready=None, vault=None):
    body = Div(
        surface_head("—", "legal · terms",
                     Span("Terms of "), Span("service.", cls="i accent")),
        _p(Span(f"Last updated {_UPDATED}.", cls="chrome")),

        _section("What this is",
            _p("Mnemos is a personal project demonstrating a memory-grounded AI agent. It is "
               "provided free of charge, as-is, with no guarantee of availability, accuracy, "
               "or fitness for any particular purpose.")),

        _section("Using it",
            _ul([
                "You are responsible for reviewing every draft before approving it. Approving "
                "an action sends a real email or creates a real calendar event on your account.",
                "Do not use Mnemos to send unsolicited bulk email, or anything unlawful, "
                "harassing, or deceptive.",
                "You may disconnect your Google account, and revoke access at Google, at any time.",
            ])),

        _section("AI-generated content",
            _p("Drafts are produced by a language model. They can be wrong, and a reviewing "
               "agent checks them but does not catch everything. Nothing Mnemos writes should "
               "be treated as fact, advice, or a commitment on your behalf until you have read "
               "it and approved it.")),

        _section("Liability",
            _p("To the maximum extent permitted by law, the author is not liable for any loss "
               "arising from use of this service, including anything sent or scheduled through "
               "it after your approval.")),

        _section("Changes",
            _p("These terms may change. Material changes will be reflected in the date at the "
               "top of this page.")),

        _section("Contact",
            _p(A("aryangorde8@gmail.com", href="mailto:aryangorde8@gmail.com", cls="accent"))),

        P(A("← Privacy policy", href="/privacy", cls="accent"), style="margin-top:36px"),
    )
    return page("terms", body, ready=ready or {}, vault=vault or {})
