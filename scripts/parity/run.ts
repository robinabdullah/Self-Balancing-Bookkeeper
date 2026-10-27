// N-1.1 (D-068): the parity harness. `npm run parity:ref` dumps the reference's build (the
// baseline); `npm run parity` dumps this repo's build and compares it with the baseline.
// Each run: build (when stale) → seed local Supabase → `next start` at the fixed clock → every
// route's text at 360 and 1280, the PDFs' text, the Excel cells → the write sequence → its audit
// rows. Local DB only; never while E2E or `npm run dev` uses local Supabase (D-065).
import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Browser, type BrowserContext, chromium, devices } from "@playwright/test";
import ExcelJS from "exceljs";
import { extractText } from "unpdf";
import { E2E_CARD_KEY, loginAsPartner } from "../../tests/e2e/helpers";
import { localSupabase } from "../../tests/e2e/local-supabase";
import { localSql, migrateLocal } from "../../tests/integration/local-db";
import { compareDumps, readDump, ttfbReport } from "./compare";
import { BASE_URL, DIST, OUT, PARITY_NOW, PARITY_PORT, ROOT, VIEWPORTS } from "./config";
import { pages, pdfs, slug, workbooks } from "./manifest";
import { aliasIds, maskGenerated, maskTimestamps } from "./normalize";
import { refCopy } from "./ref-copy";
import { seedParity } from "./seed";
import { writeSequence } from "./writes";

type Target = { name: "ref" | "self"; dir: string; appFiles: string[] };

/** This repo's app files: a build newer than all of them is reused (as playwright.config.ts). */
const SELF_FILES = ["src", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "package-lock.json"];

function newest(path: string): number {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...readdirSync(path).map((name) => newest(join(path, name))));
}

function appEnv() {
  const supabase = localSupabase();
  return {
    ...process.env,
    NEXT_DIST_DIR: DIST,
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: supabase.dbUrl,
    NEXT_PUBLIC_SUPABASE_URL: supabase.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
    CARD_SECRET_KEY: E2E_CARD_KEY,
  };
}

function build(t: Target) {
  const stamp = join(t.dir, DIST, "BUILD_ID");
  const fresh =
    existsSync(stamp) &&
    statSync(stamp).mtimeMs > Math.max(...t.appFiles.map((f) => newest(join(t.dir, f))));
  if (fresh) return console.log(`parity: reusing the ${t.name} build`);
  console.log(`parity: building ${t.name} (${t.dir})`);
  execSync("npx next build", { cwd: t.dir, env: appEnv(), stdio: "inherit" });
}

async function isUp() {
  try {
    await fetch(`${BASE_URL}/login`, { redirect: "manual" });
    return true;
  } catch {
    return false;
  }
}

async function serve(t: Target): Promise<ChildProcess> {
  if (await isUp()) throw new Error(`Port ${PARITY_PORT} is in use: stop that server first.`);
  const clock = resolve(ROOT, "scripts/parity/clock.cjs").replaceAll("\\", "/");
  const server = spawn(`npx next start --hostname 127.0.0.1 --port ${PARITY_PORT}`, {
    cwd: t.dir,
    env: { ...appEnv(), PARITY_NOW, NODE_OPTIONS: `--require "${clock}"` },
    shell: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    if (await isUp()) return server;
    await new Promise((r) => setTimeout(r, 500));
  }
  stop(server);
  throw new Error("next start did not answer within 60 s");
}

function stop(server: ChildProcess) {
  if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
  else server.kill();
}

async function newContext(browser: Browser, vp: (typeof VIEWPORTS)[number], state?: string) {
  const device = vp.name === "360" ? devices["Pixel 5"] : devices["Desktop Chrome"];
  const context = await browser.newContext({
    ...device,
    viewport: { width: vp.width, height: vp.height },
    baseURL: BASE_URL,
    storageState: state ? JSON.parse(state) : undefined,
  });
  // The forms' default dates and the browser's "today" follow the server's fixed clock.
  await context.clock.setSystemTime(new Date(PARITY_NOW));
  return context;
}

function save(dir: string, file: string, text: string) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

async function dumpRoutes(context: BrowserContext, dir: string, vp: string, refs: Record<string, string>) {
  const ttfb: Record<string, number> = {};
  const page = await context.newPage();
  for (const route of pages(refs)) {
    const response = await page.goto(route, { waitUntil: "networkidle" });
    const text = await page.evaluate(() => document.body.innerText);
    const url = new URL(page.url());
    const head = `${route}\n→ ${url.pathname}${url.search} (${response?.status()})\n\n`;
    save(dir, `routes/${vp}/${slug(route)}.txt`, head + text);
    const timing = response?.request().timing();
    if (timing) ttfb[route] = timing.responseStart - timing.requestStart;
    const shots = process.env.PARITY_SHOTS;
    if (shots && (route === "/" || route === "/stock"))
      await page.screenshot({ path: join(shots, `${slug(route)}-${vp}.png`), fullPage: true });
  }
  await page.close();
  return ttfb;
}

async function dumpFiles(context: BrowserContext, dir: string, refs: Record<string, string>) {
  for (const route of pdfs(refs)) {
    const res = await context.request.get(route);
    const name = res.headers()["content-disposition"] ?? "";
    const { text } = await extractText(new Uint8Array(await res.body()), { mergePages: true });
    save(dir, `files/${slug(route)}.txt`, `${res.status()} ${name}\n\n${maskGenerated(text)}`);
  }
  for (const route of workbooks()) {
    const res = await context.request.get(route);
    const name = res.headers()["content-disposition"] ?? "";
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await res.body()) as never);
    const cells: string[] = [];
    wb.eachSheet((ws) => {
      cells.push(`# ${ws.name}`);
      ws.eachRow((row) => row.eachCell((c) => cells.push(`${c.address}\t${c.text}`)));
    });
    save(dir, `files/${slug(route)}.txt`, `${res.status()} ${name}\n\n${cells.join("\n")}`);
  }
}

async function dumpAudit(dir: string) {
  const sql = localSql();
  const rows = await sql`select "table", action, before, after from audit_log order by at, id`;
  await sql.end();
  const lines = rows.map((r) => JSON.stringify({ ...r }));
  save(dir, "audit.jsonl", aliasIds(maskTimestamps(lines.join("\n"))));
}

export async function dump(t: Target, outName: string) {
  const dir = join(OUT, outName);
  rmSync(dir, { recursive: true, force: true });
  build(t);
  const sql = localSql();
  await migrateLocal(sql);
  const { refs } = await seedParity(sql);
  await sql.end();

  const server = await serve(t);
  const browser = await chromium.launch();
  try {
    const login = await newContext(browser, VIEWPORTS[1]);
    await loginAsPartner(await login.newPage());
    const state = JSON.stringify(await login.storageState());
    await login.close();

    let ttfb: Record<string, number> = {};
    for (const vp of VIEWPORTS) {
      const context = await newContext(browser, vp, state);
      const times = await dumpRoutes(context, dir, vp.name, refs);
      if (vp.name === "1280") ttfb = times;
      if (vp.name === "1280") await dumpFiles(context, dir, refs);
      await context.close();
    }
    const context = await newContext(browser, VIEWPORTS[1], state);
    const exported = await writeSequence(await context.newPage());
    save(dir, "files/export.txt", aliasIds(maskTimestamps(exported)));
    await context.close();
    await dumpAudit(dir);
    save(dir, "ttfb.json", JSON.stringify(ttfb, null, 2));
    save(dir, "meta.json", JSON.stringify({ target: t.name, dir: t.dir, at: new Date() }, null, 2));
  } finally {
    await browser.close();
    stop(server);
  }
  console.log(`parity: ${t.name} dumped to ${dir}`);
}

/** Prints the differences and the TTFB change; true when the dumps match. */
export function report(expectedDir: string, actualDir: string): boolean {
  const differences = compareDumps(readDump(expectedDir), readDump(actualDir));
  const read = (d: string) => {
    const f = join(d, "ttfb.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  };
  const t = ttfbReport(read(expectedDir), read(actualDir));
  const files = Object.keys(readDump(actualDir)).length;
  for (const d of differences)
    console.log(`✗ ${d.file}:${d.line}\n    expected: ${d.expected}\n    actual:   ${d.actual}`);
  console.log(
    `parity: ${differences.length === 0 ? "MATCH" : `${differences.length} file(s) differ`} ` +
      `(${files} files) · TTFB over ${t.routes} routes: ${t.before} → ${t.after} ms (${t.change >= 0 ? "+" : ""}${t.change}%)`,
  );
  return differences.length === 0;
}

async function main() {
  const [mode = "self", a, b] = process.argv.slice(2);
  if (mode === "compare") return process.exit(report(join(OUT, a), join(OUT, b)) ? 0 : 1);
  if (mode === "ref") {
    const dir = refCopy();
    return dump({ name: "ref", dir, appFiles: [".parity-sha"] }, a ?? "baseline");
  }
  await dump({ name: "self", dir: ROOT, appFiles: SELF_FILES }, a ?? "self");
  process.exit(report(join(OUT, "baseline"), join(OUT, a ?? "self")) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
