import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  typescript: { ignoreBuildErrors: false },
  output: "standalone",
  outputFileTracingRoot: process.env.NEXT_TRACE_ROOT ?? undefined,
};

export default config;
