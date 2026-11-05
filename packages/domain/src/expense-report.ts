import { CARD_FEES, categoryLabel } from "./charts/profit";
import { formatDate, formatMonth, monthOf, wholeMonth } from "./dates";
import type { StoredEntry } from "./engine/index";
import type { Posted } from "./engine/post";
import type { Sheet } from "./export";
import { add, format, sub } from "./money";
import { margin } from "./sales-report";
import { EXPENSES, EXPENSE_CATEGORIES } from "./validation/fields";

// D-075, D-080 (UIDD §4.17): the Expense statement. Every business cost by its entry date: the
// expenses (by category) and the Card fees (a Card fee entry, and a cash-out's fee). Each row is
// read off the posted entry's profit effects (`expense` / `fee`), the same source as the month's
// profit, so a reversal is a negative row on its own date and a month with no tagged row ties out.
// `?cat=` narrows everything to one category. Pure; integer poisha.

export type CostKind = "expense" | "card_fee" | "cash_out";

export type CostEntry = {
  id: string;
  date: string;
  createdAt: string;
  kind: CostKind;
  /** An expense category, or `CARD_FEES`. */
  category: string;
  /** The cost (a reversal's is negative). */
  amount: number;
  /** The month profit counts it in ("YYYY-MM"). */
  forMonth: string;
  /** "cash", or the card's id. */
  paidFrom: string;
  /** A reversal (its amount is negative). */
  reversal: boolean;
};

export type CostRow = CostEntry & { tagged: boolean };
export type CategoryLine = { key: string; label: string; amount: number; share: number | null };

export type ExpenseReport = {
  cat: string | null;
  rows: CostRow[];
  byCategory: CategoryLine[];
  total: number;
  cash: number;
  cards: number;
  /** Any row whose For month differs from its date's month. */
  tagged: boolean;
  /** D-080: a whole month's expenses dated in another month that count in its profit. */
  elsewhere: { month: string; rows: CostRow[]; total: number } | null;
};

const CATEGORIES: string[] = [...EXPENSE_CATEGORIES, CARD_FEES, EXPENSES];

/** `?cat=` if it names a category, Card fees or Expenses only (D-080), else null. */
export const costCategory = (value: unknown): string | null =>
  typeof value === "string" && CATEGORIES.includes(value) ? value : null;

/** Each posted entry's business cost (expense / fee profit effects), with its kind and source. */
export function costEntries(posted: Posted[], entries: StoredEntry[]): CostEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: CostEntry[] = [];
  for (const p of posted) {
    const costs = p.effects.filter(
      (e) => e.account === "profit" && (e.component === "expense" || e.component === "fee"),
    );
    const entry = byId.get(p.id);
    if (costs.length === 0 || entry?.table !== "money") continue;
    const kind: CostKind =
      entry.type === "card_fee"
        ? "card_fee"
        : entry.type === "card_cash_out"
          ? "cash_out"
          : "expense";
    const first = costs[0];
    out.push({
      id: p.id,
      date: p.date,
      createdAt: p.createdAt,
      kind,
      category: first.component === "fee" ? CARD_FEES : (first.category ?? "other"),
      amount: 0 - costs.reduce((s, e) => add(s, e.amount), 0),
      forMonth: monthOf(first.month ?? p.date),
      paidFrom: kind === "expense" && entry.source !== "card" ? "cash" : (entry.cardId ?? "cash"),
      reversal: !!p.reversesId,
    });
  }
  return out;
}

/** No filter, the category, or (Expenses only) any category but the card fees. */
const inFilter = (c: CostEntry, cat: string | null) =>
  !cat || (cat === EXPENSES ? c.category !== CARD_FEES : c.category === cat);

/** "Rent", "Card fees", or "Expenses only": what `?cat=` shows. */
export const filterLabel = (cat: string) =>
  cat === EXPENSES ? "Expenses only" : categoryLabel(cat);

/** Date, then saved time, then id: the books' order. */
const saved = (a: CostEntry, b: CostEntry) =>
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

const tag = (c: CostEntry): CostRow => ({ ...c, tagged: c.forMonth !== monthOf(c.date) });

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => add(s, r.amount), 0);

/** The costs dated `from`…`to`, by category (largest first, Card fees last), or the filter's. */
export function expenseReport(
  costs: CostEntry[],
  from: string,
  to: string,
  cat: string | null = null,
): ExpenseReport {
  const rows = costs
    .filter((c) => c.date >= from && c.date <= to && inFilter(c, cat))
    .sort(saved)
    .map(tag);
  const total = sum(rows);
  const month = wholeMonth(from, to);
  const away = month
    ? costs
        .filter((c) => c.forMonth === month && (c.date < from || c.date > to) && inFilter(c, cat))
        .sort(saved)
        .map(tag)
    : [];
  const groups = new Map<string, CostRow[]>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const byCategory = [...groups].map(([key, list]) => {
    const amount = sum(list);
    return {
      key,
      label: categoryLabel(key),
      amount,
      share: total === 0 ? null : margin(amount, total),
    };
  });
  byCategory.sort(
    (a, b) =>
      Number(a.key === CARD_FEES) - Number(b.key === CARD_FEES) ||
      b.amount - a.amount ||
      a.label.localeCompare(b.label),
  );
  const cash = sum(rows.filter((r) => r.paidFrom === "cash"));
  return {
    cat,
    rows,
    byCategory,
    total,
    cash,
    cards: sub(total, cash),
    tagged: rows.some((r) => r.tagged),
    elsewhere: month && away.length > 0 ? { month, rows: away, total: sum(away) } : null,
  };
}

/** A row's Category: "Rent", "Card fee" or "Cash-out fee". */
export const costLabel = (r: Pick<CostEntry, "kind" | "category">) =>
  r.kind === "card_fee"
    ? "Card fee"
    : r.kind === "cash_out"
      ? "Cash-out fee"
      : categoryLabel(r.category);

/** "Cash", or the card's name. */
export const paidFromLabel = (r: Pick<CostEntry, "paidFrom">, name: (id: string) => string) =>
  r.paidFrom === "cash" ? "Cash" : name(r.paidFrom);

/** The row's note, "Reversal · …" for a reversal. */
export const noteOf = (r: Pick<CostEntry, "id" | "reversal">, notes: Record<string, string>) =>
  [r.reversal && "Reversal", notes[r.id]].filter(Boolean).join(" · ");

/** D-075: the statement's Excel: By category · Entries (each with a Total row). */
export function expenseSheets(
  r: ExpenseReport,
  name: (id: string) => string,
  notes: Record<string, string>,
): Sheet[] {
  return [
    {
      name: "By category",
      columns: [
        { header: "Category", kind: "text" },
        { header: "Amount", kind: "money" },
        { header: "Share %", kind: "pct" },
      ],
      rows: [...r.byCategory.map((c) => [c.label, c.amount, c.share]), ["Total", r.total, null]],
    },
    {
      name: "Entries",
      columns: [
        { header: "Date", kind: "date" },
        { header: "For month", kind: "text" },
        { header: "Category", kind: "text" },
        { header: "Paid from", kind: "text" },
        { header: "Note", kind: "text" },
        { header: "Amount", kind: "money" },
      ],
      rows: [
        ...r.rows.map((row) => [
          row.date,
          row.tagged ? formatMonth(row.forMonth) : null,
          costLabel(row),
          paidFromLabel(row, name),
          noteOf(row, notes) || null,
          row.amount,
        ]),
        // The Total sits under Category: a date column can only hold dates.
        [null, null, "Total", null, null, r.total],
      ],
    },
  ];
}

/** D-080: "12 entries · Cash ৳48,500 · Cards ৳3,000" (a ৳0 part left out). */
export function spendLine(r: ExpenseReport): string {
  const n = r.rows.length;
  return [
    `${n} ${n === 1 ? "entry" : "entries"}`,
    r.cash !== 0 && `Cash ${format(r.cash)}`,
    r.cards !== 0 && `Cards ${format(r.cards)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Expense statement", or "Expense statement · Rent" while filtered. */
export const expenseTitle = (cat: string | null) =>
  cat ? `Expense statement · ${filterLabel(cat)}` : "Expense statement";

/** D-080: "Oct 2026's profit also counts ৳30,000 dated in another month:" (null: none). */
export function elsewhereNote(r: ExpenseReport): string | null {
  const e = r.elsewhere;
  return e
    ? `${formatMonth(e.month)}'s profit also counts ${format(e.total)} dated in another month:`
    : null;
}

/** "Salary · 02 Nov 2026": a row of that note. */
export const elsewhereLine = (row: CostRow) => `${costLabel(row)} · ${formatDate(row.date)}`;
