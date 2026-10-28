import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// N-1.2: the app lives in apps/web of an npm-workspaces repo; the repo root holds the lockfile,
// the hoisted node_modules and the one `.env.local` (D-066).
const root = path.join(__dirname, "../..");

// Next loads env files from apps/web only, so web's own values are taken from the root one. A
// variable already set is never overridden, so E2E's and the parity harness's own env still win.
// N-6.1 (D-068): only these; the database URL and the card key are the api's alone. The
// standalone server doesn't run this file: it gets its own env file at deploy (N-7).
const WEB_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "API_URL"];
const envFile = path.join(root, ".env.local");
if (existsSync(envFile)) {
  const env = parseEnv(readFileSync(envFile, "utf8"));
  for (const key of WEB_ENV) if (env[key] !== undefined) process.env[key] ??= env[key];
}

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
};

export default nextConfig;
