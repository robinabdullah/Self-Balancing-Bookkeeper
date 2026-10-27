import {
  addDays,
  addMonths,
  clampDay,
  daysBetween,
  formatDate,
  formatMonth,
  monthDiff,
  monthOf,
} from "@/lib/dates";
import { parseRange } from "@/lib/journal-filter";

// D-064 (UIDD §4.17): the Charts page's window, kept in the URL (`?period=6m|12m|year`, or a
// custom `?from=&to=` from the Report sheet's View on screen). Pure.
//
// 6M / 12M = this month and the 5 (11) before it, to today. A window never starts before the
// opening (`firstDate`) or ends after today. ≤ 62 days are drawn by day, longer ones by month.
// The previous window (a flow's "vs prev") is the same length right before; it is null unless
// all of it is on or after the opening, so a window is never compared with a shorter one.

export const PERIODS = [
  ["6m", "6M"],
  ["12m", "12M"],
  ["year", "This year"],
] as const;

export type PeriodKey = (typeof PERIODS)[number][0] | "custom";

/** One bar or point: a month ("2026-10") or a day; `end` is its last day within the window. */
export type Bucket = { key: string; label: string; start: string; end: string };

export type ChartPeriod = {
  key: PeriodKey;
  from: string;
  to: string;
  view: "day" | "month";
  buckets: Bucket[];
  prev: { from: string; to: string } | null;
};

const DAY_VIEW_MAX = 62;

function windowOf(key: PeriodKey, today: string): { from: string; to: string } {
  if (key === "year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  const back = key === "12m" ? 11 : 5;
  return { from: `${addMonths(monthOf(today), -back)}-01`, to: today };
}

export function chartPeriod(
  params: { period?: string | string[]; from?: string | string[]; to?: string | string[] },
  today: string,
  firstDate: string,
): ChartPeriod {
  const clip = (w: { from: string; to: string }) => ({
    from: w.from < firstDate ? firstDate : w.from,
    to: w.to > today ? today : w.to,
  });
  const asked = parseRange(params);
  const custom = asked && clip(asked);
  let key: PeriodKey;
  let from: string;
  let to: string;
  if (custom && custom.from <= custom.to) {
    ({ from, to } = custom);
    key = "custom";
  } else {
    key = PERIODS.find(([k]) => k === params.period)?.[0] ?? "6m";
    ({ from, to } = clip(windowOf(key, today)));
  }

  const days = daysBetween(from, to) + 1;
  const view = days <= DAY_VIEW_MAX ? "day" : "month";
  const buckets: Bucket[] = [];
  if (view === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      buckets.push({ key: d, label: formatDate(d), start: d, end: d });
    }
  } else {
    for (let m = monthOf(from); m <= monthOf(to); m = addMonths(m, 1)) {
      const start = m === monthOf(from) ? from : `${m}-01`;
      const last = clampDay(m, 31);
      buckets.push({ key: m, label: formatMonth(m), start, end: last > to ? to : last });
    }
  }

  const months = monthDiff(monthOf(from), monthOf(to)) + 1;
  const prevFrom =
    view === "day"
      ? addDays(from, -days)
      : clampDay(addMonths(monthOf(from), -months), Number(from.slice(8)));
  const prev = prevFrom >= firstDate ? { from: prevFrom, to: addDays(from, -1) } : null;

  return { key, from, to, view, buckets, prev };
}

/** The window as URL params: a custom range, or the period key (6M, the default, is none). */
export function periodQuery(period: ChartPeriod): Record<string, string | null> {
  return period.key === "custom"
    ? { from: period.from, to: period.to }
    : { period: period.key === "6m" ? null : period.key };
}
