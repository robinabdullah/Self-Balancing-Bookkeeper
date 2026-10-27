// N-1.1: the reference's build is never made in the reference (it is read-only, CLAUDE.md). Its
// committed app files are exported with `git archive` (which only reads the repo) into a copy
// outside both repos, installed there and built there. No docs or tests are copied. A new
// reference HEAD (a hotfix, HF-n) re-exports it; otherwise the copy and its build are reused.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REF_COPY, REF_REPO } from "./config";

/** What `next build` and `next start` need; anything else the reference holds stays there. */
const APP_PATHS = [
  "src",
  "public",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
];

const git = (...args: string[]) =>
  execFileSync("git", ["-C", REF_REPO, ...args], { encoding: "utf8" }).trim();

/** The copy's folder, exported and installed for the reference's current HEAD. */
export function refCopy(): string {
  const sha = git("rev-parse", "HEAD");
  const shaFile = join(REF_COPY, ".parity-sha");
  if (existsSync(shaFile) && readFileSync(shaFile, "utf8").trim() === sha) return REF_COPY;

  console.log(`parity: exporting the reference ${sha.slice(0, 7)} to ${REF_COPY}`);
  const tracked = new Set(git("ls-tree", "--name-only", "HEAD").split("\n"));
  const paths = APP_PATHS.filter((p) => tracked.has(p));
  // A fresh tree each time; node_modules stays when the lockfile is the same (npm ci otherwise).
  const lock = join(REF_COPY, "package-lock.json");
  const oldLock = existsSync(lock) ? readFileSync(lock, "utf8") : null;
  mkdirSync(REF_COPY, { recursive: true });
  for (const name of readdirSync(REF_COPY))
    if (name !== "node_modules") rmSync(join(REF_COPY, name), { recursive: true, force: true });
  // Relative paths only: GNU tar (Git for Windows) reads "D:" as a host name.
  const tar = ".parity-ref.tar";
  git("archive", `--output=${join(REF_COPY, tar)}`, "HEAD", "--", ...paths);
  execFileSync("tar", ["-xf", tar], { cwd: REF_COPY });
  rmSync(join(REF_COPY, tar));

  if (oldLock !== readFileSync(lock, "utf8") || !existsSync(join(REF_COPY, "node_modules")))
    execSync("npm ci --no-audit --no-fund", { cwd: REF_COPY, stdio: "inherit" });
  writeFileSync(shaFile, `${sha}\n`);
  return REF_COPY;
}
