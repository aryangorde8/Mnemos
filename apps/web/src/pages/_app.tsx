import type { AppProps } from "next/app";
import Head from "next/head";
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { MotionConfig } from "framer-motion";
import { useRouter } from "next/router";
import { CommandPalette } from "@/components/command-palette";
import { useCmdK } from "@/lib/use-cmd-k";
import "@/styles/globals.css";

const display = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-display-loaded",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans-loaded",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-mono-loaded",
  display: "swap",
});

export default function App({ Component, pageProps }: AppProps) {
  const palette = useCmdK();
  const router = useRouter();
  return (
    <MotionConfig reducedMotion="user">
      <Head>
        <title>Mnemos — the memory agent</title>
        <meta
          name="description"
          content="The first AI agent that takes multi-step actions on top of your professional memory."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0b0a08" />
        <meta name="color-scheme" content="dark" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/favicon.svg" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Mnemos" />
        <meta property="og:title" content="Mnemos — the memory agent" />
        <meta
          property="og:description"
          content="The first AI agent that takes multi-step actions on top of your professional memory."
        />
        <meta property="og:image" content="/og.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Mnemos — the memory agent" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Mnemos — the memory agent" />
        <meta
          name="twitter:description"
          content="The first AI agent that takes multi-step actions on top of your professional memory."
        />
        <meta name="twitter:image" content="/og.png" />
      </Head>
      <div className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <Component {...pageProps} key={router.asPath} />
        <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
      </div>
    </MotionConfig>
  );
}
