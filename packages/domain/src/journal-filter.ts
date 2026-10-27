import { addMonths, clampDay, formatMonth, monthOf } from "./dates";
import { add } from "./money";

// UIDD §4.10 (D-032): the Journal's filters, kept in the URL (`?type=&who=&period=&from=&to=&q=`)
// so a page can link to a filtered Journal and a reload keeps them. Pure.
//
// Period: "" all time · "this" / "last" month · "YYYY-MM" · "custom" (From–To, both included).
// A month matches entries dated in it or marked "for" it (an Oct expense for Sep is under Sep).

export type JournalFilter = {
  type: string;
  who: string;
  period: string;
  from: string;
  to: string;
  q: string;
};

export const NO_FILTER: JournalFilter = { type: "", who: "", period: "", from: "", to: "", q: "" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;

/** The filter from URL params; anything unknown or malformed is dropped. */
export function parseFilter(params: Params, types: readonly string[]): JournalFilter {
  const one = (key: string) => {
    const v = params[key];
    return typeof v === "string" ? v.trim() : "";
  };
  const period = one("period");
  const custom = period === "custom";
  return {
    type: types.includes(one("type")) ? one("type") : "",
    who: UUID.test(one("who")) ? one("who") : "",
    period: ["this", "last", "custom"].includes(period) || MONTH.test(period) ? period : "",
    from: custom && DATE.test(one("from")) ? one("from") : "",
    to: custom && DATE.test(one("to")) ? one("to") : "",
    q: one("q").slice(0, 100),
  };
}

/** The URL params for a filter (empty ones left out; From/To only for a custom range). */
export function toQuery(f: JournalFilter): Record<string, string | null> {
  const custom = f.period === "custom";
  return {
    type: f.type || null,
    who: f.who || null,
    period: f.period || null,
    from: (custom && f.from) || null,
    to: (custom && f.to) || null,
    q: f.q.trim() || null,
  };
}

/** The month a period stands for ("this", "last" or "YYYY-MM"), else null. */
export function periodMonth(period: string, today: string): string | null {
  if (period === "this") return monthOf(today);
  if (period === "last") return addMonths(monthOf(today), -1);
  return MONTH.test(period) ? period : null;
}

/** A custom range whose From is after its To: nothing matches, and the form says why. */
export const rangeError = (f: JournalFilter) =>
  f.period === "custom" && !!f.from && !!f.to && f.from > f.to;

/** How many filters are set (the phone's "Filters (n)" button). */
export const activeCount = (f: JournalFilter) =>
  [f.type, f.who, f.period, f.q.trim()].filter(Boolean).length;

type Row = {
  type: string;
  date: string;
  forMonth: string | null;
  customerId: string | null;
  supplierId: string | null;
  cardId: string | null;
  personId: string | null;
};

/** Does `row` pass `f`? `text` is what the search looks in (label, who, note). */
export function matches(row: Row, f: JournalFilter, today: string, text: string) {
  if (f.type && row.type !== f.type) return false;
  if (f.who && ![row.customerId, row.supplierId, row.cardId, row.personId].includes(f.who))
    return false;
  const month = periodMonth(f.period, today);
  if (month && monthOf(row.date) !== month && row.forMonth !== month) return false;
  if (f.period === "custom") {
    if (rangeError(f)) return false;
    if (f.from && row.date < f.from) return false;
    if (f.to && row.date > f.to) return false;
  }
  const q = f.q.trim().toLowerCase();
  return !q || text.toLowerCase().includes(q);
}

/** The Period choices: All time, This/Last month, each earlier month back to `first`, Custom. */
export function periodOptions(first: string | null, today: string): [string, string][] {
  const current = monthOf(today);
  const months: [string, string][] = [];
  for (let m = addMonths(current, -2); first && m >= first; m = addMonths(m, -1))
    months.push([m, formatMonth(m)]);
  return [
    ["", "All time"],
    ["this", `This month (${formatMonth(current)})`],
    ["last", `Last month (${formatMonth(addMonths(current, -1))})`],
    ...months,
    ["custom", "Custom range"],
  ];
}

/** With exactly one type filtered, the shown entries' total (poisha); otherwise null. */
export function filteredTotal(rows: { amount: number }[], f: JournalFilter): number | null {
  return f.type ? rows.reduce((n, r) => add(n, r.amount), 0) : null;
}

/** D-040: the dates a Report sheet period covers (a month: its 1st to its last day); else null. */
export function periodRange(
  period: string,
  today: string,
  custom: { from: string; to: string } = { from: "", to: "" },
): { from: string; to: string } | null {
  const month = periodMonth(period, today);
  if (month) return { from: `${month}-01`, to: clampDay(month, 31) };
  if (period !== "custom") return null;
  return parseRange(custom);
}

/** `?from=&to=` on an account page: both real dates, From ≤ To; anything else → null. */
export function parseRange(params: {
  from?: string | string[];
  to?: string | string[];
}): { from: string; to: string } | null {
  const { from, to } = params;
  if (typeof from !== "string" || typeof to !== "string") return null;
  const real = (d: string) => DATE.test(d) && clampDay(d.slice(0, 7), Number(d.slice(8))) === d;
  if (!real(from) || !real(to) || from > to) return null;
  return { from, to };
}
