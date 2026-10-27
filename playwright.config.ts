import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_CARD_KEY, PARTNER_STATE } from "./tests/e2e/helpers";
import { localSupabase } from "./tests/e2e/local-supabase";

// A port of its own, so E2E never reuses a `npm run dev` pointed at the cloud DB. E2E_PORT
// overrides it if Windows/Hyper-V reserves the port (`netsh int ipv4 show excludedportrange`).
const PORT = Number(process.env.E2E_PORT ?? 3001);
const supabase = localSupabase();
const DIST = ".next-e2e";

/** The newest change time of a file or of anything under a folder. */
function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...readdirSync(path).map((name) => newest(join(path, name))));
}

// D-065: locally, a build no app file is newer than is reused (a re-run after a test-only fix
// skips the ~2½-min build). CI always builds.
const APP_FILES = [
  "src",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "package-lock.json",
];
const buildIsFresh =
  !process.env.CI &&
  existsSync(`${DIST}/BUILD_ID`) &&
  statSync(`${DIST}/BUILD_ID`).mtimeMs > Math.max(...APP_FILES.map(newest));

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One shared local DB (like test:int's fileParallelism: false): the dashboard test (E4.6.1)
  // reads totals over every row, so no other test may write while it runs.
  workers: 1,
  // Claude Code sets CLAUDECODE: `dot` prints failures in full but not a line per passing test.
  reporter: process.env.CI ? "github" : process.env.CLAUDECODE ? "dot" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    // A failing test leaves a picture (CI uploads them, D-065).
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile",
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 740 },
        storageState: PARTNER_STATE,
      },
    },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: PARTNER_STATE,
      },
    },
  ],
  // A production build, not `next dev` (D-047): late in a full run, dev recompiled evicted routes
  // ever more slowly (0.7 s → 15 s) as its memory grew, and tests timed out waiting (CR-027).
  // The build goes to `.next-e2e`, so a running `npm run dev` keeps its `.next`. `next start`
  // warns about `output: "standalone"` but serves the same build the VPS runs.
  webServer: {
    command: `${buildIsFresh ? "" : "npx next build && "}npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // Process env beats .env.local in Next (also for the NEXT_PUBLIC_ values baked in at build),
    // so the app talks to local Supabase only.
    env: {
      NEXT_DIST_DIR: DIST,
      DATABASE_URL: supabase.dbUrl,
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
      // A test-only key for saved card details (D-046); the real one is only on the VPS.
      CARD_SECRET_KEY: E2E_CARD_KEY,
    },
  },
});
