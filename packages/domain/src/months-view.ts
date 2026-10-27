import { addMonths, clampDay, formatDate, monthDiff, monthOf } from "./dates";
import { type Books, type BooksData, type StoredEntry, computeBooks } from "./engine/index";
import { type MonthProfit, type MonthRow, monthProfit } from "./engine/months";
import type { ProfitComponent } from "./engine/post";
import { parse, pct } from "./money";
import { EXPENSE_LABELS } from "./validation/fields";

// UIDD §4.9 (task 5.1, CR-024): the Months list and the close screen's defaults (SRS §7), read off
// `computeBooks` and the stored allocations. Pure: integer poisha; `asOf` is passed in.

export type MonthListRow = {
  month: string;
  profit: number;
  status: string;
  next: boolean;
  closed: boolean;
  /** Opens its page: up to this month (D-044), the next month to close, or a closed month. */
  link: boolean;
};

/**
 * Newest first: every month from the first one (the opening month, or the next to close) to this
 * month, plus any later month with profit (a for-month), each with profit (a closed month's = Σ its
 * allocations; a quiet month 0). Status = "Open" or "Closed on dd Mon" (the
 * `month_closes.close_date`). A month after this month has no link (D-044).
 */
export function monthList(
  months: MonthRow[],
  closes: { month: string; closeDate: string }[],
  next: string,
  thisMonth: string,
): MonthListRow[] {
  const closedOn = new Map(closes.map((c) => [monthOf(c.month), c.closeDate]));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const listed = [...byMonth.keys(), next, thisMonth].sort();
  const [first, last] = [listed[0], listed.at(-1) ?? next];
  const rows = Array.from(
    { length: monthDiff(first, last) + 1 },
    (_, i) =>
      byMonth.get(addMonths(first, i)) ?? { month: addMonths(first, i), profit: 0, closed: false },
  );
  return rows.reverse().map((m) => {
    const on = closedOn.get(m.month);
    return {
      month: m.month,
      profit: m.profit,
      status: m.closed && on ? `Closed on ${formatDate(on).slice(0, 6)}` : "Open",
      next: m.month === next,
      closed: m.closed,
      link: m.month === next || m.closed || m.month <= thisMonth,
    };
  });
}

export type BreakdownLine = { label: string; amount: number };

const COMPONENT_LABEL: Record<Exclude<ProfitComponent, "expense">, string> = {
  sale: "Sale profit",
  customer_return: "Customer returns",
  discount: "Customer discounts",
  profit_share: "Profit share",
  cashback: "Cashback",
  fee: "Card fees",
  purchase_return: "Purchase returns",
};

/**
 * UIDD §4.9 step 1: each component as it counts (expenses by category, only those used); the lines
 * sum to the total.
 */
export function breakdownLines(p: MonthProfit): BreakdownLine[] {
  const label = (c: string) => EXPENSE_LABELS[c as keyof typeof EXPENSE_LABELS] ?? c;
  const expenses = Object.entries(p.expenses)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, amount]) => ({ label: `Expense: ${label(c)}`, amount }));
  const line = (c: keyof typeof COMPONENT_LABEL) => ({
    label: COMPONENT_LABEL[c],
    amount: p.components[c],
  });
  return [
    line("sale"),
    line("customer_return"),
    line("discount"),
    line("profit_share"),
    line("cashback"),
    ...expenses,
    line("fee"),
    line("purchase_return"),
  ];
}

/** "1.125" → 1.125: a rate %, ≥ 0 with ≤ 3 decimals (numeric(6,3)); null for anything else. */
export function parseRate(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(t)) return null;
  return Number(t);
}

/** An investor line as typed: basis, rate % and amount (the form fills the amount). */
export type LineText = { basis: string; ratePct: string; amount: string };

export type LineRead = {
  /** The `allocations` row to store; null = skipped (no amount, or basis 0). */
  row: { basis: number; ratePct: number; amount: number } | null;
  /** What it counts in the totals: the row's amount, else 0. */
  amount: number;
  errors: Partial<Record<keyof LineText, string>>;
};

/**
 * One investor line (SRS §7 step 2, D-028): stored only with basis > 0, a rate and an amount
 * (≥ 0). No amount (or 0 with no basis), or basis 0 with amount 0, is skipped and counts as 0;
 * an amount without both a basis and a rate is an error. The close form and action share it.
 */
export function readLine(t: LineText): LineRead {
  const has = (s: string) => s.trim() !== "";
  const basis = has(t.basis) ? parse(t.basis) : null;
  const ratePct = has(t.ratePct) ? parseRate(t.ratePct) : null;
  const amount = has(t.amount) ? parse(t.amount) : null;
  const errors: LineRead["errors"] = {};
  if (has(t.basis) && (basis == null || basis < 0)) errors.basis = "Basis: enter 0 or more";
  if (has(t.ratePct) && ratePct == null) errors.ratePct = "Rate: a % like 1.5 (up to 3 decimals)";
  if (has(t.amount) && (amount == null || amount < 0)) errors.amount = "Amount: enter 0 or more";
  if (Object.keys(errors).length || amount == null) return { row: null, amount: 0, errors };
  if (basis != null && basis > 0 && ratePct != null)
    return { row: { basis, ratePct, amount }, amount, errors };
  if (amount === 0) return { row: null, amount: 0, errors };
  return {
    row: null,
    amount: 0,
    errors: { amount: "Amount: enter a basis (more than 0) and a rate for it" },
  };
}

/** An investor's cash or card part on the close screen; null = blank (no last-month value). */
export type InvestorLine = {
  personId: string;
  name: string;
  kind: "cash" | "card";
  basis: number | null;
  ratePct: number | null;
  amount: number | null;
};

type Investor = { id: string; name: string; kind: string; active: boolean };

/**
 * SRS §7 step 2 defaults: one cash and one card line per investor (active, or still holding
 * capital at month end). Cash basis = their capital at month end; the card basis and both rates =
 * their M−1 allocation (blank the first time); amount = basis × rate when both are known.
 */
export function investorLines(
  people: Investor[],
  atMonthEnd: Books,
  allocations: BooksData["allocations"],
  month: string,
): InvestorLine[] {
  const prev = addMonths(month, -1);
  const last = (id: string, kind: "cash" | "card") =>
    allocations.find((a) => a.personId === id && a.kind === kind && monthOf(a.month) === prev);
  return people
    .filter((p) => p.kind === "investor" && (p.active || (atMonthEnd.capital[p.id] ?? 0) !== 0))
    .flatMap((p) =>
      (["cash", "card"] as const).map((kind) => {
        const before = last(p.id, kind);
        const basis = kind === "cash" ? (atMonthEnd.capital[p.id] ?? 0) : (before?.basis ?? null);
        const ratePct = before?.ratePct ?? null;
        return {
          personId: p.id,
          name: p.name,
          kind,
          basis,
          ratePct,
          amount: basis != null && ratePct != null && basis >= 0 ? pct(basis, ratePct) : null,
        };
      }),
    );
}

/** The share entries that still stand: neither a reversal nor reversed. */
function standingShares(entries: StoredEntry[]) {
  const reversed = new Set(entries.flatMap((e) => (e.reversesId ? [e.reversesId] : [])));
  return entries.flatMap((e) =>
    e.table === "money" &&
    e.type === "customer_profit_share" &&
    !e.reversesId &&
    !reversed.has(e.id) &&
    e.customerId
      ? [{ customerId: e.customerId, month: monthOf(e.forMonth ?? e.date) }]
      : [],
  );
}

/** UIDD §4.9 step 4: customers with a profit share for M−1 but none for M (never blocks). */
export function shareReminders(entries: StoredEntry[], month: string): string[] {
  const shares = standingShares(entries);
  const has = (m: string) => new Set(shares.filter((s) => s.month === m).map((s) => s.customerId));
  const now = has(month);
  return [...has(addMonths(month, -1))].filter((id) => !now.has(id));
}

export type CloseScreen = {
  month: string;
  profit: MonthProfit;
  lines: BreakdownLine[];
  investors: InvestorLine[];
  /** Customer ids to remind about. */
  reminders: string[];
};

/** Everything the close screen for `month` shows, from the stored facts as of `asOf` (today). */
export function closeScreen(
  data: BooksData,
  books: Books,
  people: Investor[],
  month: string,
  asOf: string,
): CloseScreen {
  const end = clampDay(month, 31);
  const profit = monthProfit(books.posted, month, asOf);
  return {
    month,
    profit,
    lines: breakdownLines(profit),
    investors: investorLines(people, computeBooks(data, end), data.allocations, month),
    reminders: shareReminders(data.entries, month),
  };
}
