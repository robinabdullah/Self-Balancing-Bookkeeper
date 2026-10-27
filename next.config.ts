import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained `server.js` that scripts/deploy.sh copies to the VPS (D-031).
  output: "standalone",
  // E2E builds into `.next-e2e`, so it never overwrites a running `npm run dev` (D-047).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dev indicator sits bottom-left, on top of the mobile tab bar's Home tab.
  devIndicators: false,
  // The PDF fonts are read from disk at run time, so the standalone build must ship them (D-041).
  outputFileTracingIncludes: { "/pdf/**": ["./src/pdf/fonts/**"] },
};

export default nextConfig;
