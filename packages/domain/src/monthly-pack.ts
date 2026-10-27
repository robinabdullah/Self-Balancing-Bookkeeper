import { cashBook } from "@/lib/cash-book";
import { profitsFor } from "@/lib/charts/profit";
import { type Breakdown, breakdown } from "@/lib/dashboard";
import { addMonths, clampDay } from "@/lib/dates";
import type { Books } from "@/lib/engine/index";
import type { Allocation, MonthProfit } from "@/lib/engine/months";
import { add, sub } from "@/lib/money";
import { breakdownLines } from "@/lib/months-view";
import type { SalesGroup, SalesReport } from "@/lib/sales-report";
import { type StockLine, type StockMoveRow, stockMovement } from "@/lib/stock-movement";

// D-045 (UIDD §4.17): the Monthly partner pack, read off the books as on the month's last day
// (today for this month) and the books the day before its 1st. Each section comes from the same
// function as the screen that already shows that figure: the profit from the close snapshot or
// `monthProfit` (the Months page), the position from `breakdown` (the balance chip), sales from
// `salesReport` (the Sales report), cash from `cashBook` (the Cash book), dues from the books'
// statements. Pure; integer poisha.

export type ProfitRow = { label: string; amount: number; last: number | null };
export type DueChange = { id: string; start: number; end: number; change: number };
export type CardBillRow = {
  cardId: string;
  month: string;
  dueDate: string;
  amount: number;
  remaining: number;
  overdue: boolean;
};
export type CashFlowRow = { type: string; label: string; in: number; out: number };

export type MonthlyPack = {
  month: string;
  /** The last day it reads (the month end, or today for this month). */
  end: string;
  closed: boolean;
  profit: { rows: ProfitRow[]; total: number; last: number | null };
  position: Breakdown;
  allocations: { rows: Allocation[] | null; owed: { id: string; amount: number }[] };
  sales: SalesReport;
  stock: StockMoveRow[];
  dues: { customers: DueChange[]; suppliers: DueChange[] };
  cards: { bills: CardBillRow[]; emi: { cardId: string; remaining: number }[] };
  cash: { opening: number; rows: CashFlowRow[]; closing: number };
};

export type PackInput = {
  month: string;
  today: string;
  /** The opening month (the first entry's), or null with no entries. */
  firstMonth: string | null;
  books: Books;
  atStart: Books;
  atEnd: Books;
  /** Closed months' stored snapshots (this month and the one before, when closed). */
  snapshots: Record<string, MonthProfit>;
  allocations: Allocation[];
  closed: string[];
  sales: SalesReport;
  stockLines: StockLine[];
  /** An entry's Journal type and that type's label. */
  typeOf: (entryId: string) => string | undefined;
  typeLabel: (type: string) => string;
};

/** The pack's dates: the 1st, the last day it reads, and the day before the 1st. */
export function packDates(month: string, today: string) {
  const monthEnd = clampDay(month, 31);
  return {
    start: `${month}-01`,
    end: monthEnd < today ? monthEnd : today,
    before: clampDay(addMonths(month, -1), 31),
  };
}

const nonZero = (r: DueChange) => r.start !== 0 || r.end !== 0;
function dueChanges(start: Books["customers"], end: Books["customers"]): DueChange[] {
  const ids = [...new Set([...Object.keys(start), ...Object.keys(end)])];
  return ids
    .map((id) => {
      const [s, e] = [start[id]?.balance ?? 0, end[id]?.balance ?? 0];
      return { id, start: s, end: e, change: sub(e, s) };
    })
    .filter(nonZero)
    .sort((a, b) => b.end - a.end || a.id.localeCompare(b.id));
}

export function monthlyPack(i: PackInput): MonthlyPack {
  const { month, today, books, atEnd } = i;
  const { start, end } = packDates(month, today);
  const closed = i.closed.some((c) => c.slice(0, 7) === month);

  // 1. Profit: a closed month's snapshot (as the Months page), an open month's `monthProfit`.
  const prevMonth = addMonths(month, -1);
  const inBooks = (m: string) =>
    m in i.snapshots || (i.firstMonth != null && m >= i.firstMonth && m <= today.slice(0, 7));
  const profits = profitsFor([month, prevMonth].filter(inBooks), i.snapshots, books.posted, today);
  const [now, before] = [profits[month], profits[prevMonth] ?? null];
  const lastLines = before ? breakdownLines(before) : [];
  const labels = [...new Set([...breakdownLines(now), ...lastLines].map((l) => l.label))];
  const amountIn = (lines: { label: string; amount: number }[], label: string) =>
    lines.find((l) => l.label === label)?.amount ?? 0;
  const rows = labels.map((label) => ({
    label,
    amount: amountIn(breakdownLines(now), label),
    last: before ? amountIn(lastLines, label) : null,
  }));

  // 3. Allocations: the stored rows when closed; each person's profit owed at the end.
  const allocations = closed
    ? i.allocations.filter((a) => a.month.slice(0, 7) === month).map((a) => ({ ...a, month }))
    : null;
  const owed = Object.entries(atEnd.profitOwed)
    .filter(([, amount]) => amount !== 0)
    .map(([id, amount]) => ({ id, amount }));

  // 7. Card bills due next month, and those overdue at the end, as on the end.
  const next = addMonths(month, 1);
  const bills: CardBillRow[] = Object.entries(atEnd.cards).flatMap(([cardId, s]) =>
    s.bills
      .filter((b) => b.dueDate.slice(0, 7) === next || (b.dueDate < end && b.remaining > 0))
      .map((b) => ({
        cardId,
        month: b.month,
        dueDate: b.dueDate,
        amount: b.amount,
        remaining: b.remaining,
        overdue: b.dueDate < end && b.remaining > 0,
      })),
  );
  bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardId.localeCompare(b.cardId));
  const emi = Object.entries(atEnd.cards)
    .filter(([, s]) => s.remainingEmi !== 0)
    .map(([cardId, s]) => ({ cardId, remaining: s.remainingEmi }));

  // 8. Cash flow by entry type: the Cash book's rows (a reversal on the opposite side).
  const book = cashBook(books.posted, start, end);
  const flow = new Map<string, CashFlowRow>();
  for (const r of book.days.flatMap((d) => d.rows)) {
    const type = i.typeOf(r.id) ?? "other";
    const row = flow.get(type) ?? { type, label: i.typeLabel(type), in: 0, out: 0 };
    if (r.amount > 0) row.in = add(row.in, r.amount);
    else row.out = sub(row.out, r.amount);
    flow.set(type, row);
  }

  return {
    month,
    end,
    closed,
    profit: { rows, total: now.total, last: before?.total ?? null },
    position: breakdown(atEnd),
    allocations: { rows: allocations, owed },
    sales: i.sales,
    stock: stockMovement(i.stockLines, start, end, i.firstMonth),
    dues: {
      customers: dueChanges(i.atStart.customers, atEnd.customers),
      suppliers: dueChanges(i.atStart.suppliers, atEnd.suppliers),
    },
    cards: { bills, emi },
    cash: {
      opening: book.opening,
      rows: [...flow.values()].sort((a, b) => b.in + b.out - (a.in + a.out)),
      closing: book.closing,
    },
  };
}

export const sumOf = <T>(rows: T[], pick: (r: T) => number) =>
  rows.reduce((n, r) => add(n, pick(r)), 0);

/** The "Other customers" row's id (its name is added by the loader). */
export const OTHERS = "others";

/** The top `n` groups (customers, models) by `by`, then the rest as one "Other" row, so the table
 * still totals the net sales (the same totals as the Sales report). */
export function topGroups(
  groups: SalesGroup[],
  n = 5,
  by: "sales" | "profit" | "pieces" = "sales",
): SalesGroup[] {
  const sorted = [...groups].sort((a, b) => b[by] - a[by] || a.id.localeCompare(b.id));
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n);
  return [
    ...sorted.slice(0, n),
    {
      id: OTHERS,
      pieces: rest.reduce((t, g) => t + g.pieces, 0),
      sales: sumOf(rest, (g) => g.sales),
      profit: sumOf(rest, (g) => g.profit),
      avgPieces: 0, // D-056: the Other row has no average price
      avg: null,
    },
  ];
}
