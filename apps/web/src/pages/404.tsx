import Head from "next/head";
import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 — Mnemos</title>
      </Head>
      <main className="relative flex min-h-dvh flex-col items-start justify-center px-10 md:px-20">
        <div className="max-w-[600px]">
          <span className="label mb-6 block">404 · not in the vault</span>

          <h1
            className="display text-[clamp(3rem,8vw,6rem)] leading-[0.94] italic"
            style={{ color: "var(--color-paper)" }}
          >
            Nothing
            <br />
            <span style={{ color: "var(--color-paper-dim)" }}>here</span>{" "}
            <em style={{ color: "var(--color-vermilion)" }}>yet.</em>
          </h1>

          <div
            className="mt-4 h-px w-40"
            style={{ background: "var(--color-vermilion)" }}
          />

          <p className="mt-8 max-w-[38ch] text-[1rem] leading-[1.6]" style={{ color: "var(--color-paper-dim)" }}>
            This page isn&apos;t in Mnemos&apos; memory. Go back to the vault
            or ask the agent something.
          </p>

          <div className="mt-10 flex items-center gap-8">
            <Link
              href="/"
              className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]"
            >
              ← back to home
            </Link>
            <Link
              href="/ask"
              className="chrome transition-colors hover:text-[color:var(--color-paper-dim)]"
            >
              open the agent →
            </Link>
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 select-none"
          style={{ color: "var(--color-rule)", fontSize: "clamp(8rem,20vw,16rem)", lineHeight: 1, fontFamily: "Iowan Old Style, Baskerville, Georgia, serif", fontStyle: "italic" }}
        >
          404
        </div>
      </main>
    </>
  );
}
