// N-1.1: the parity harness's fixed settings. Both builds (the reference copy and this repo) run
// one after the other against this repo's local Supabase, on the same port, at the same frozen
// "now", so their dumps can be compared byte for byte.
import { resolve } from "node:path";

/** The harness's "now": 20 Oct 2026, 11:00 in Dhaka. The seed's dates sit before it. */
export const PARITY_NOW = "2026-10-20T05:00:00.000Z";
export const PARITY_TODAY = "2026-10-20";

/** Never 3000 (dev) or 3001 (E2E): the harness must not reuse either server. */
export const PARITY_PORT = Number(process.env.PARITY_PORT ?? 3011);
/** N-2.4: the Nest API beside it (self target only); never 3003 (dev api) or 3002 (E2E). */
export const PARITY_API_PORT = Number(process.env.PARITY_API_PORT ?? 3012);
export const API_BASE_URL = `http://127.0.0.1:${PARITY_API_PORT}`;
export const BASE_URL = `http://127.0.0.1:${PARITY_PORT}`;

/** The read-only reference repo, and the copy the harness builds (never built in place). */
export const REF_REPO = "D:/Projects/Mobile-Business-Lite";
export const REF_COPY = process.env.PARITY_REF_COPY ?? "D:/Projects/MBL-parity-ref";

/** This repo's root, and where dumps go (gitignored). */
export const ROOT = process.cwd(); // the npm scripts run from the repo root
export const OUT = resolve(ROOT, ".parity");

/** The build both apps run from (apart from `.next` and `.next-e2e`). */
export const DIST = ".next-parity";

/** The viewports every route is dumped at (as in playwright.config.ts). */
export const VIEWPORTS = [
  { name: "360", width: 360, height: 740 },
  { name: "1280", width: 1280, height: 800 },
] as const;
