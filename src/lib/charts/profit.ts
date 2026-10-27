import {
  addDays,
  addMonths,
  clampDay,
  formatDate,
  formatMonth,
  monthDiff,
  monthOf,
} from "@/lib/dates";
import { type MonthProfit, monthProfit } from "@/lib/engine/months";
import type { Posted } from "@/lib/engine/post";
import { add, sub } from "@/lib/money";
import { type BreakdownLine, type MonthListRow, breakdownLines } from "@/lib/months-view";
import {
  type ReturnedLine,
  type SalesReport,
  type SoldLine,
  margin,
  salesReport,
} from "@/lib/sales-report";
import { EXPENSE_LABELS } from "@/lib/validation/fields";
import type { ChartPeriod } from "./period";

// D-064 (UIDD §4.17): the Profit tab: Net profit, Sales & margin, Expenses. Each figure comes from
// the function the screen that already shows it uses: net profit from `monthList` (the Months
// page), a month's breakdown and expenses from the close snapshot or `monthProfit` (the month
// page), sales and margin from `salesReport` (the Sales report).
//
// Clarified 2026-10-24: Net profit and Expenses always count whole months (a part month = its
// Months row), in the day view too; the day view's profit is sales profit (sale + customer return)
// per day. Sales & margin uses the window's own buckets. Pure; integer poisha.

/** Card fees' key among the expense categories: the `fee` component (card and cash-out fees). */
export const CARD_FEES = "card-fees";

/** The whole months a window touches, and the same number right before (null: any of them is
 * before the opening month). `partial`: a custom range starts or ends mid-month. */
export type MonthsWindow = { months: string[]; prev: string[] | null; partial: boolean };

const monthsFrom = (first: string, n: number) =>
  Array.from({ length: n }, (_, i) => addMonths(first, i));

export function wholeMonths(
  period: Pick<ChartPeriod, "from" | "to">,
  firstDate: string,
  today: string,
): MonthsWindow {
  const [first, last] = [monthOf(period.from), monthOf(period.to)];
  const n = monthDiff(first, last) + 1;
  const prevFirst = addMonths(first, -n);
  const cutStart = period.from !== `${first}-01` && period.from !== firstDate;
  const cutEnd = period.to !== clampDay(last, 31) && period.to !== today;
  return {
    months: monthsFrom(first, n),
    prev: prevFirst >= monthOf(firstDate) ? monthsFrom(prevFirst, n) : null,
    partial: cutStart || cutEnd,
  };
}

export type Point = { key: string; label: string; amount: number };

const sum = (values: number[]) => values.reduce((a, b) => add(a, b), 0);

/** Net profit per month = the Months list's rows (a closed month's = Σ its allocations). */
export function netProfitSeries(rows: MonthListRow[], months: string[]): Point[] {
  const profit = new Map(rows.map((r) => [r.month, r.profit]));
  return months.map((m) => ({ key: m, label: formatMonth(m), amount: profit.get(m) ?? 0 }));
}

/** Sales profit per day (the day view): the profit effects of sales and customer returns, on
 * their entry's date, as the Sales report's net sales profit. */
export function salesProfitByDay(posted: Posted[], from: string, to: string): Point[] {
  const byDay = new Map<string, number>();
  for (const p of posted) {
    if (p.date < from || p.date > to) continue;
    for (const e of p.effects) {
      if (e.account !== "profit") continue;
      if (e.component !== "sale" && e.component !== "customer_return") continue;
      byDay.set(p.date, add(byDay.get(p.date) ?? 0, e.amount));
    }
  }
  const days: Point[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    days.push({ key: d, label: formatDate(d), amount: byDay.get(d) ?? 0 });
  }
  return days;
}

/** Sale and customer-return lines with their entry's date. */
export type DatedLines = {
  sold: (SoldLine & { date: string })[];
  returned: (ReturnedLine & { date: string })[];
};

/** The Sales report of the lines dated `from` … `to`. */
export function salesIn(lines: DatedLines, from: string, to: string): SalesReport {
  const inside = (l: { date: string }) => l.date >= from && l.date <= to;
  return salesReport(lines.sold.filter(inside), lines.returned.filter(inside));
}

export type SalesPoint = {
  key: string;
  label: string;
  sales: number;
  cost: number;
  gross: number;
  margin: number | null;
};

/** Sales, cost, gross profit and margin % per bucket, each the Sales report for its dates. */
export function salesSeries(lines: DatedLines, buckets: ChartPeriod["buckets"]): SalesPoint[] {
  return buckets.map((b) => {
    const r = salesIn(lines, b.start, b.end);
    return {
      key: b.key,
      label: b.label,
      sales: r.sales,
      cost: r.cost,
      gross: r.grossProfit,
      margin: r.margin,
    };
  });
}

/** Each month's profit and breakdown: a closed month's stored snapshot, else `monthProfit` as
 * known today (the Months page, the month page and the Monthly pack). */
export function profitsFor(
  months: string[],
  snapshots: Record<string, MonthProfit>,
  posted: Posted[],
  today: string,
): Record<string, MonthProfit> {
  return Object.fromEntries(months.map((m) => [m, snapshots[m] ?? monthProfit(posted, m, today)]));
}

/** What a month spent: −(expense + fee), or one category's (`CARD_FEES` = the fee). */
function spent(p: MonthProfit | undefined, category?: string): number {
  if (!p) return 0;
  if (category === CARD_FEES) return 0 - p.components.fee;
  if (category) return 0 - (p.expenses[category] ?? 0);
  return 0 - add(p.components.expense, p.components.fee);
}

/** Expenses per month (all, or one category). */
export function expenseSeries(
  profits: Record<string, MonthProfit>,
  months: string[],
  category?: string,
): Point[] {
  return months.map((m) => ({
    key: m,
    label: formatMonth(m),
    amount: spent(profits[m], category),
  }));
}

export type CategoryRow = {
  key: string;
  label: string;
  amount: number;
  /** % of the total spent, to 1 decimal; null when nothing was spent. */
  share: number | null;
  /** vs the previous months; null without them. */
  change: number | null;
};

export const categoryLabel = (key: string) =>
  key === CARD_FEES ? "Card fees" : (EXPENSE_LABELS[key as keyof typeof EXPENSE_LABELS] ?? key);

/** The window's categories, largest first, Card fees last; those spent now or before. */
export function categoryShares(
  profits: Record<string, MonthProfit>,
  months: string[],
  prev: string[] | null,
): CategoryRow[] {
  const total = (ms: string[], c?: string) => sum(ms.map((m) => spent(profits[m], c)));
  const keys = new Set<string>();
  for (const m of [...months, ...(prev ?? [])]) {
    for (const c of Object.keys(profits[m]?.expenses ?? {})) keys.add(c);
  }
  const all = total(months);
  const row = (key: string): CategoryRow => {
    const amount = total(months, key);
    return {
      key,
      label: categoryLabel(key),
      amount,
      share: all === 0 ? null : margin(amount, all),
      change: prev ? sub(amount, total(prev, key)) : null,
    };
  };
  const rows = [...keys].map(row).filter((r) => r.amount !== 0 || (r.change ?? 0) !== 0);
  rows.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const fees = row(CARD_FEES);
  return fees.amount !== 0 || (fees.change ?? 0) !== 0 ? [...rows, fees] : rows;
}

export type ProfitInput = {
  period: ChartPeriod;
  window: MonthsWindow;
  /** The Months list's rows. */
  rows: MonthListRow[];
  posted: Posted[];
  /** Closed months' stored snapshots (at least those in the window and the one before). */
  snapshots: Record<string, MonthProfit>;
  /** Dated from the previous window's start (or the window's) to its end. */
  lines: DatedLines;
  today: string;
  /** Expenses: one category only. */
  category?: string;
};

/** A total and the same total for the window before (null: no delta). */
export type Total = { amount: number; prev: number | null };

export type ProfitCharts = {
  /** Month view: net profit per whole month; day view: sales profit per day. */
  profit: { view: "day" | "month"; points: Point[]; total: Total };
  /** A month's breakdown lines, for the readout's "See breakdown" (month view). */
  breakdown: Record<string, BreakdownLine[]>;
  sales: { points: SalesPoint[]; total: Total; margin: number | null };
  expenses: { points: Point[]; total: Total; categories: CategoryRow[] };
};

export function profitCharts(i: ProfitInput): ProfitCharts {
  const { period, window: w } = i;
  const profits = profitsFor([...(w.prev ?? []), ...w.months], i.snapshots, i.posted, i.today);
  const totalOf = (points: Point[]) => sum(points.map((p) => p.amount));

  const byMonth = period.view === "month";
  const points = byMonth
    ? netProfitSeries(i.rows, w.months)
    : salesProfitByDay(i.posted, period.from, period.to);
  const prevProfit = byMonth
    ? w.prev && totalOf(netProfitSeries(i.rows, w.prev))
    : period.prev && totalOf(salesProfitByDay(i.posted, period.prev.from, period.prev.to));

  const window = salesIn(i.lines, period.from, period.to);
  const prevSales = period.prev && salesIn(i.lines, period.prev.from, period.prev.to).sales;

  const spentNow = expenseSeries(profits, w.months, i.category);
  const spentBefore = w.prev && totalOf(expenseSeries(profits, w.prev, i.category));

  return {
    profit: { view: period.view, points, total: { amount: totalOf(points), prev: prevProfit } },
    breakdown: Object.fromEntries(w.months.map((m) => [m, breakdownLines(profits[m])])),
    sales: {
      points: salesSeries(i.lines, period.buckets),
      total: { amount: window.sales, prev: prevSales },
      margin: window.margin,
    },
    expenses: {
      points: spentNow,
      total: { amount: totalOf(spentNow), prev: spentBefore },
      categories: categoryShares(profits, w.months, w.prev),
    },
  };
}
