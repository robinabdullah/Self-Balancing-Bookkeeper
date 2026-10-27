import { addDays, daysBetween, formatDate } from "@/lib/dates";
import type { Statement, StatementRow } from "@/lib/engine/customers";
import type { Posted } from "@/lib/engine/post";
import { topGroups } from "@/lib/monthly-pack";
import { add, avgTaka, sub } from "@/lib/money";
import type { SalesGroup } from "@/lib/sales-report";
import type { Kind } from "./kinds";
import type { ChartPeriod } from "./period";
import { positionAt } from "./position";
import type { Point, Total } from "./profit";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Customers tab and a customer's Due trend. A due
// is read from the posted `customer_due` effects (SRS §5), so the total dues at each bucket end =
// `positionAt` = the Books balance. Given = sales + cash given, Collected = payments, Other = every
// other change by kind (Walk-in's net is one kind); a reversal counts under its original's kind,
// negated, on its own date. Pure; integer poisha.

/** An Other kind: a Journal type, or Walk-in's net. */
export type OtherKind = Kind | "walk_in";

export type FlowPoint = {
  key: string;
  label: string;
  given: number;
  /** Payments, as a positive amount (a reversed payment lowers it). */
  collected: number;
  other: number;
  /** Given − Collected + Other: the change in total dues. */
  change: number;
};

export type DueFlows = {
  buckets: FlowPoint[];
  /** The window's Other by kind, largest first (zeros left out). */
  other: { kind: OtherKind; amount: number }[];
  /** The window's net change, with the previous window's (null when it isn't all after the
   * opening). */
  total: Total;
};

const changeIn = (posted: Posted[], from: string, to: string) =>
  posted
    .filter((p) => p.date >= from && p.date <= to)
    .flatMap((p) => p.effects.filter((e) => e.account === "customer_due"))
    .reduce((s, e) => add(s, e.amount), 0);

export function dueFlows(
  posted: Posted[],
  kinds: Map<string, Kind>,
  walkIn: string | null,
  period: ChartPeriod,
): DueFlows {
  const buckets = period.buckets.map((b) => ({
    key: b.key,
    label: b.label,
    given: 0,
    collected: 0,
    other: 0,
    change: 0,
  }));
  const other = new Map<OtherKind, number>();
  for (const p of posted) {
    const n = period.buckets.findIndex((b) => p.date >= b.start && p.date <= b.end);
    if (n < 0) continue;
    const r = buckets[n];
    for (const e of p.effects) {
      if (e.account !== "customer_due") continue;
      const kind: OtherKind = e.id === walkIn ? "walk_in" : kinds.get(p.id)!;
      if (kind === "sale" || kind === "customer_cash_given") r.given = add(r.given, e.amount);
      else if (kind === "customer_payment") r.collected = sub(r.collected, e.amount);
      else {
        r.other = add(r.other, e.amount);
        other.set(kind, add(other.get(kind) ?? 0, e.amount));
      }
      r.change = add(r.change, e.amount);
    }
  }
  const prev = period.prev && changeIn(posted, period.prev.from, period.prev.to);
  return {
    buckets,
    other: [...other]
      .filter(([, amount]) => amount !== 0)
      .map(([kind, amount]) => ({ kind, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.kind.localeCompare(b.kind)),
    total: { amount: buckets.reduce((s, b) => add(s, b.change), 0), prev },
  };
}

/** A statement's due at the end of each day from `from` to `to` (rows oldest first). */
export function dueDays(rows: StatementRow[], from: string, to: string): Point[] {
  const points: Point[] = [];
  let due = 0;
  let i = 0;
  for (; i < rows.length && rows[i].date < from; i++) due = rows[i].balance;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (; i < rows.length && rows[i].date <= d; i++) due = rows[i].balance;
    points.push({ key: d, label: formatDate(d), amount: due });
  }
  return points;
}

/** The due as on `date`. */
const dueOn = (rows: StatementRow[], date: string) =>
  rows.filter((r) => r.date <= date).at(-1)?.balance ?? 0;

export type DueTrend = {
  points: Point[];
  /** Today's due (the customer page's). */
  now: number;
  /** The end-of-day dues' mean, to whole taka (`avgTaka`); null without days. */
  average: number | null;
  lowest: number;
  highest: number;
  /** The latest payment that still stands, and how many days before today. */
  lastPaid: { date: string; days: number } | null;
};

/** A customer's Due trend; `payments` = the dates of their payments that still stand (ever). */
export function dueTrend(
  rows: StatementRow[],
  from: string,
  to: string,
  today: string,
  payments: string[],
): DueTrend {
  const points = dueDays(rows, from, to);
  const amounts = points.map((p) => p.amount);
  const last = payments
    .filter((d) => d <= today)
    .sort()
    .at(-1);
  return {
    points,
    now: dueOn(rows, today),
    average: avgTaka(
      amounts.reduce((s, a) => add(s, a), 0),
      amounts.length,
    ),
    lowest: Math.min(...amounts),
    highest: Math.max(...amounts),
    lastPaid: last ? { date: last, days: daysBetween(last, today) } : null,
  };
}

export type LowestDue = { id: string; lowest: number; now: number };

/** The customers who kept a due all through the window: their lowest end-of-day due > 0, highest
 * first; Walk-in is left out. */
export function lowestDues(
  customers: Record<string, Statement>,
  walkIn: string | null,
  from: string,
  to: string,
  today: string,
): LowestDue[] {
  return Object.entries(customers)
    .filter(([id]) => id !== walkIn)
    .map(([id, s]) => ({
      id,
      lowest: Math.min(...dueDays(s.rows, from, to).map((p) => p.amount)),
      now: dueOn(s.rows, today),
    }))
    .filter((c) => c.lowest > 0)
    .sort((a, b) => b.lowest - a.lowest || a.id.localeCompare(b.id));
}

export const TOP = 10;

export type CustomerInput = {
  period: ChartPeriod;
  posted: Posted[];
  kinds: Map<string, Kind>;
  /** Each customer's statement as of today (`books.customers`). */
  customers: Record<string, Statement>;
  walkIn: string | null;
  /** The window's Sales report's By customer. */
  byCustomer: SalesGroup[];
  by: "sales" | "profit";
  today: string;
};

export type CustomerCharts = {
  /** Total dues as on each bucket's last day; the last is the headline. */
  dues: Point[];
  /** Total dues as on the window's first day: the "since" base. */
  start: number;
  flows: DueFlows;
  lowest: LowestDue[];
  /** The top 10 by `by`, then "Other customers". */
  top: SalesGroup[];
};

export function customerCharts(i: CustomerInput): CustomerCharts {
  const { period } = i;
  const [start, ...atEnds] = positionAt(i.posted, [
    period.from,
    ...period.buckets.map((b) => b.end),
  ]);
  return {
    dues: atEnds.map((p, n) => ({
      key: period.buckets[n].key,
      label: period.buckets[n].label,
      amount: p.customerDues,
    })),
    start: start.customerDues,
    flows: dueFlows(i.posted, i.kinds, i.walkIn, period),
    lowest: lowestDues(i.customers, i.walkIn, period.from, period.to, i.today),
    top: topGroups(i.byCustomer, TOP, i.by),
  };
}
