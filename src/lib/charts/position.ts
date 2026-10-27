import { cashBook } from "@/lib/cash-book";
import { type CardAlert, cardAlerts } from "@/lib/dashboard";
import { addDays, formatDate, formatMonth, monthOf } from "@/lib/dates";
import type { Books } from "@/lib/engine/index";
import type { Allocation } from "@/lib/engine/months";
import type { Account, Posted } from "@/lib/engine/post";
import { add, sub } from "@/lib/money";
import type { ChartPeriod } from "./period";
import type { MonthsWindow, Point, Total } from "./profit";

// D-064 (UIDD §4.17; clarified 2026-10-24): the Money tab: Business value, Cash, Card debt and
// Profit shares. A position is as on each bucket's last day (D-045), the same sums as
// `balance()`, so today's = the Books balance sheet (`breakdown()`); cash runs as the Cash book;
// profit shares are the stored allocations of the closed months, by whole month. Pure; integer
// poisha.

/** The asset and liability side of the books as on `end` (SRS §5), signed as `balance()`. */
export type Position = {
  end: string;
  cash: number;
  stock: number;
  customerDues: number;
  cardBalances: number;
  supplierDues: number;
  /** Cash + stock + customer dues: the gross figure. */
  businessAssets: number;
  /** Business assets − card balances − supplier dues (net assets). */
  netWorth: number;
};

const POSITION_ACCOUNTS: Partial<Record<Account, keyof Position>> = {
  cash: "cash",
  stock: "stock",
  customer_due: "customerDues",
  card: "cardBalances",
  supplier_due: "supplierDues",
};

/** The position as on each of `ends`, in one pass over the entries sorted by date. */
export function positionAt(posted: Posted[], ends: string[]): Position[] {
  const sums = { cash: 0, stock: 0, customerDues: 0, cardBalances: 0, supplierDues: 0 };
  const byEnd = new Map<string, Position>();
  const sorted = [...posted].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  for (const end of [...new Set(ends)].sort()) {
    for (; i < sorted.length && sorted[i].date <= end; i++) {
      for (const e of sorted[i].effects) {
        const key = POSITION_ACCOUNTS[e.account] as keyof typeof sums | undefined;
        if (key) sums[key] = add(sums[key], e.amount);
      }
    }
    const businessAssets = add(add(sums.cash, sums.stock), sums.customerDues);
    const netWorth = sub(businessAssets, add(sums.cardBalances, sums.supplierDues));
    byEnd.set(end, { end, ...sums, businessAssets, netWorth });
  }
  return ends.map((end) => byEnd.get(end)!);
}

/** The cash at the end of each day, from the Cash book (days without moves carry it over), and
 * the days it ended below 0. */
export function dailyCash(
  posted: Posted[],
  from: string,
  to: string,
): { points: Point[]; below: Point[] } {
  const book = cashBook(posted, from, to);
  const closing = new Map(book.days.map((d) => [d.date, d.closing]));
  const points: Point[] = [];
  let cash = book.opening;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    cash = closing.get(d) ?? cash;
    points.push({ key: d, label: formatDate(d), amount: cash });
  }
  return { points, below: points.filter((p) => p.amount < 0) };
}

/** A month's profit shares: a closed month's allocations per person (an investor's cash and
 * card rows are one figure); an open month is "not allocated yet". */
export type ShareMonth = {
  key: string;
  label: string;
  closed: boolean;
  byPerson: Record<string, number>;
  total: number;
};

export function profitShares(
  allocations: Allocation[],
  closed: string[],
  months: string[],
): ShareMonth[] {
  const closedSet = new Set(closed.map(monthOf));
  return months.map((m) => {
    const byPerson: Record<string, number> = {};
    let total = 0;
    if (closedSet.has(m)) {
      for (const a of allocations) {
        if (monthOf(a.month) !== m) continue;
        byPerson[a.personId] = add(byPerson[a.personId] ?? 0, a.amount);
        total = add(total, a.amount);
      }
    }
    return { key: m, label: formatMonth(m), closed: closedSet.has(m), byPerson, total };
  });
}

export type MoneyInput = {
  period: ChartPeriod;
  /** Profit shares' whole months. */
  window: MonthsWindow;
  posted: Posted[];
  allocations: Allocation[];
  closed: string[];
  /** The card summaries as of today (Bills due next). */
  cards: Books["cards"];
  today: string;
};

export type MoneyCharts = {
  /** One per bucket, as on its last day; the last is the headline. */
  positions: (Position & { key: string; label: string })[];
  /** As on the window's first day: the positions' "since" base. */
  start: Position;
  cash: { days: Point[]; below: Point[] };
  shares: { months: ShareMonth[]; total: Total };
  /** Bills due next, as of today (Home's card alerts). */
  bills: CardAlert[];
};

const closedTotal = (months: ShareMonth[]) => months.reduce((s, m) => add(s, m.total), 0);

export function moneyCharts(i: MoneyInput): MoneyCharts {
  const { period, window: w } = i;
  const ends = period.buckets.map((b) => b.end);
  const [start, ...atEnds] = positionAt(i.posted, [period.from, ...ends]);
  const months = profitShares(i.allocations, i.closed, w.months);
  const prev = w.prev && closedTotal(profitShares(i.allocations, i.closed, w.prev));
  const cash = dailyCash(i.posted, period.from, period.to);
  return {
    positions: atEnds.map((p, n) => ({
      ...p,
      key: period.buckets[n].key,
      label: period.buckets[n].label,
    })),
    start,
    cash: { days: cash.points, below: cash.below },
    shares: { months, total: { amount: closedTotal(months), prev } },
    bills: cardAlerts(i.cards, i.today),
  };
}
