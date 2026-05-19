import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
  disconnectGmail,
  getGmailStatus,
  gmailConnectUrl,
  listActions,
  type ActionRecord,
  type ActionStatus,
  type GmailStatus,
} from "@/lib/api";
import { ApprovalCard } from "@/components/approval-card";

type FilterTab = "proposed" | "sent" | "rejected" | "all";

export default function ActionsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>("proposed");
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const justConnected = router.query.connected === "gmail";

  useEffect(() => {
    void getGmailStatus().then(setGmail);
  }, [justConnected, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const opts: { status?: ActionStatus; limit: number } = { limit: 50 };
    if (tab !== "all") opts.status = tab;
    void listActions(opts).then((res) => {
      if (cancelled) return;
      if (!res) {
        setErr("agent unreachable — boot apps/agent and check MONGODB_URI");
        setActions([]);
      } else {
        setActions(res.actions);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  return (
    <>
      <Head>
        <title>Mnemos — actions ledger</title>
      </Head>
      <main className="relative min-h-dvh w-full">
        <header className="border-b border-[color:var(--color-rule)]/70">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between px-10 py-4 md:px-16">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="display text-[1.4rem] italic leading-none text-[color:var(--color-paper)]">
                Mnemos
              </span>
              <span className="label">μν. · the ledger</span>
            </Link>
            <nav className="flex items-center gap-5 chrome">
              <Link href="/search" className="hover:text-[color:var(--color-paper-dim)]">search</Link>
              <span aria-hidden>·</span>
              <Link href="/ask" className="hover:text-[color:var(--color-paper-dim)]">ask</Link>
              <span aria-hidden>·</span>
              <Link href="/actions" className="text-[color:var(--color-paper-dim)]">actions</Link>
            </nav>
          </div>
        </header>

        <section className="mx-auto max-w-[1240px] px-10 pb-32 pt-14 md:px-16">
          <div className="flex items-center gap-3">
            <span className="block h-px w-10 bg-[color:var(--color-vermilion)]" />
            <span className="label">04 · the ledger</span>
          </div>

          <h1 className="display mt-6 max-w-[28ch] text-[clamp(2rem,5vw,3.2rem)] italic leading-[1.05] text-[color:var(--color-paper)]">
            What the agent
            <span style={{ color: "var(--color-paper-muted)" }}> has proposed.</span>
          </h1>

          {/* Gmail OAuth banner — only visible when the agent has Gmail
              env vars configured. When connected, the next 'approve & send'
              actually sends via Gmail API; otherwise the simulated send
              behaviour is unchanged. */}
          {gmail?.configured && (
            <GmailBanner
              status={gmail}
              justConnected={justConnected}
              onDisconnect={async () => {
                await disconnectGmail();
                setReloadKey((k) => k + 1);
              }}
            />
          )}

          <div className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-[color:var(--color-rule)] pb-3">
            {(["proposed", "sent", "rejected", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`font-mono text-[0.78rem] uppercase tracking-[0.14em] transition-colors ${
                  tab === t
                    ? "text-[color:var(--color-paper)]"
                    : "text-[color:var(--color-paper-faint)] hover:text-[color:var(--color-paper-dim)]"
                }`}
              >
                {t}
                {tab === t ? (
                  <span className="ml-2 text-[color:var(--color-vermilion)]">·</span>
                ) : null}
              </button>
            ))}
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="ml-auto chrome hover:text-[color:var(--color-paper-dim)]"
            >
              ↻ refresh
            </button>
          </div>

          {loading ? (
            <LoadingStrip />
          ) : err ? (
            <ErrorPanel message={err} />
          ) : actions.length === 0 ? (
            <EmptyPanel tab={tab} />
          ) : (
            <div className="mt-8">
              {actions.map((a) => (
                <div key={a.id} className="mb-6">
                  <RowHeader action={a} />
                  <ApprovalCard
                    actionId={a.id}
                    onResolved={() => setReloadKey((k) => k + 1)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function RowHeader({ action }: { action: ActionRecord }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 chrome">
      <span>
        <span className="text-[color:var(--color-paper-muted)]">{action.kind === "draft_email" ? "draft email" : "scheduled meeting"}</span>
        {action.query ? (
          <>
            <span className="px-2 text-[color:var(--color-rule-strong)]">·</span>
            <span className="text-[color:var(--color-paper-dim)]">"{action.query}"</span>
          </>
        ) : null}
      </span>
      <span className="font-mono">{new Date(action.createdAt).toLocaleString()}</span>
    </div>
  );
}

function LoadingStrip() {
  return (
    <div className="mt-8 space-y-6">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-40 border border-[color:var(--color-rule)] bg-[color:var(--color-ink-1)]/60"
          style={{ opacity: 0.7 - i * 0.18 }}
        />
      ))}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-[color:var(--color-vermilion-deep)]/60 bg-[color:var(--color-ink-1)] p-6">
      <p className="label">ledger unavailable</p>
      <p className="mt-2 font-mono text-[0.85rem] text-[color:var(--color-paper-dim)]">{message}</p>
    </div>
  );
}

function EmptyPanel({ tab }: { tab: FilterTab }) {
  const msgs: Record<FilterTab, string> = {
    proposed: "no pending proposals. ask the agent to draft something.",
    sent: "nothing has been sent yet — every approved action lands here.",
    rejected: "no rejected proposals on file.",
    all: "the ledger is empty. start at /ask.",
  };
  return (
    <div className="mt-10 border-t border-[color:var(--color-rule)] pt-12">
      <p className="label">empty</p>
      <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-relaxed text-[color:var(--color-paper-dim)]">
        {msgs[tab]}
      </p>
    </div>
  );
}

function GmailBanner({
  status,
  justConnected,
  onDisconnect,
}: {
  status: GmailStatus;
  justConnected: boolean;
  onDisconnect: () => void | Promise<void>;
}) {
  const connected = status.connected;
  return (
    <div
      className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3"
      style={{
        border: "1px solid var(--color-rule)",
        background: "var(--color-ink-1)",
        padding: "14px 20px",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: -1,
          top: -1,
          bottom: -1,
          width: 2,
          background: connected ? "var(--color-moss)" : "var(--color-saffron)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 720 }}>
        <div className="flex items-baseline gap-3">
          <span
            className="label"
            style={{ color: connected ? "var(--color-moss)" : "var(--color-saffron)" }}
          >
            {connected ? "✓ gmail connected" : "gmail · awaiting connect"}
          </span>
          {justConnected && connected && (
            <span className="chrome" style={{ color: "var(--color-paper-dim)" }}>
              ← just authorized
            </span>
          )}
        </div>
        <p
          className="chrome"
          style={{ color: "var(--color-paper-muted)", lineHeight: 1.55, maxWidth: 640 }}
        >
          {connected ? (
            <>
              Approvals on draft emails will send live via{" "}
              <span style={{ color: "var(--color-paper)" }}>{status.email ?? "your account"}</span>{" "}
              using <code style={{ color: "var(--color-paper-dim)" }}>gmail.users.messages.send</code>.
              Disconnect to fall back to simulated sends.
            </>
          ) : (
            <>
              Connect your Google account once and the next{" "}
              <em className="display-i">approve &amp; send</em> will fire a real Gmail
              <code style={{ color: "var(--color-paper-dim)" }}> users.messages.send</code> instead of
              just flipping the status to <span style={{ color: "var(--color-paper-dim)" }}>sent</span>.
              You can disconnect anytime.
            </>
          )}
        </p>
      </div>
      <div>
        {connected ? (
          <button
            onClick={() => void onDisconnect()}
            className="mono focusable"
            style={{
              padding: "6px 14px",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-paper-muted)",
              border: "1px solid var(--color-rule-strong)",
              background: "var(--color-ink-2)",
              cursor: "pointer",
            }}
          >
            ⊘ disconnect
          </button>
        ) : (
          <a
            href={gmailConnectUrl()}
            className="mono focusable"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-paper)",
              border: "1px solid var(--color-vermilion)",
              background: "var(--color-ink-2)",
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            <span style={{ color: "var(--color-vermilion)" }}>→</span>
            connect gmail
          </a>
        )}
      </div>
    </div>
  );
}
