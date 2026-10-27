import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// N-1.2: the app lives in apps/web of an npm-workspaces repo; the repo root holds the lockfile,
// the hoisted node_modules and the one `.env.local` (D-066).
const root = path.join(__dirname, "../..");

// Next loads env files from apps/web only. Node's loader never overrides a variable already set,
// so E2E's and the parity harness's own env still win. The standalone server doesn't run this
// file: deploy.sh copies `.env.local` next to its server.js.
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const nextConfig: NextConfig = {
  // A self-contained `server.js` that scripts/deploy.sh copies to the VPS (D-031).
  output: "standalone",
  // E2E builds into `.next-e2e`, so it never overwrites a running `npm run dev` (D-047).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // The dev indicator sits bottom-left, on top of the mobile tab bar's Home tab.
  devIndicators: false,
  // Trace and bundle from the repo root, where the workspace's node_modules are.
  outputFileTracingRoot: root,
  turbopack: { root },
  // The shared packages ship TypeScript source; Next compiles them with the app (N-1.3).
  transpilePackages: ["@mbl/domain"],
  // The PDF fonts are read from disk at run time, so the standalone build must ship them (D-041).
  outputFileTracingIncludes: { "/pdf/**": ["./src/pdf/fonts/**"] },
};

export default nextConfig;
