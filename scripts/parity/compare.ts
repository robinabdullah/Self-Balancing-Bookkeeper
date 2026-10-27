// N-1.1: compares two dump folders (the baseline from the reference, and a run of this repo).
// Every file must match byte for byte, except ttfb.json (only reported) and meta.json (which run).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Difference = { file: string; line: number; expected: string; actual: string };
export type Ttfb = Record<string, number>; // route → ms

/** Every file under `dir`, by its path relative to `dir` (forward slashes). */
export function readDump(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).replaceAll("\\", "/")] = readFileSync(path, "utf8");
    }
  };
  if (existsSync(dir)) walk(dir);
  return files;
}

/** The first differing line of each file that differs, and files only one side has. */
export function compareDumps(
  expected: Record<string, string>,
  actual: Record<string, string>,
): Difference[] {
  const differences: Difference[] = [];
  const files = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  for (const file of files) {
    if (file === "ttfb.json" || file === "meta.json") continue;
    const a = expected[file];
    const b = actual[file];
    if (a === b) continue;
    if (a === undefined || b === undefined) {
      differences.push({
        file,
        line: 0,
        expected: a === undefined ? "(missing)" : "(present)",
        actual: b === undefined ? "(missing)" : "(present)",
      });
      continue;
    }
    const left = a.split("\n");
    const right = b.split("\n");
    const i = left.findIndex((l, n) => l !== right[n]);
    const line = i === -1 ? left.length : i; // right has extra lines at the end
    differences.push({
      file,
      line: line + 1,
      expected: left[line] ?? "(end of file)",
      actual: right[line] ?? "(end of file)",
    });
  }
  return differences;
}

/** Median TTFB per route on each side, and the change of the summed medians. */
export function ttfbReport(expected: Ttfb, actual: Ttfb) {
  const routes = Object.keys(expected).filter((r) => r in actual);
  const total = (t: Ttfb) => routes.reduce((sum, r) => sum + t[r], 0);
  const before = total(expected);
  const after = total(actual);
  const change = before === 0 ? 0 : Math.round(((after - before) / before) * 1000) / 10;
  return { routes: routes.length, before: Math.round(before), after: Math.round(after), change };
}
