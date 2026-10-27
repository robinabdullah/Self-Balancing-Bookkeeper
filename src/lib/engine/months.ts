// Months (SRS §7, PRD §4.4): Profit(M) with its breakdown, profit owed per person, undistributed
// profit, and the partner split at close. Each profit effect already carries its month (the date's
// or the for_month, SRS §5); closed months use their stored `allocations`, never a recomputation.
// Pure; integer poisha.
import type { allocationKind } from "@/db/schema";
import { addMonths, monthOf } from "@/lib/dates";
import {
  type Partner,
  type Posted,
  PROFIT_COMPONENTS,
  type ProfitComponent,
} from "@/lib/engine/post";
import { add, splitShares, sub } from "@/lib/money";

/** A stored `allocations` row; `month` is "YYYY-MM" or the stored 1st. */
export type Allocation = {
  month: string;
  personId: string;
  kind: (typeof allocationKind.enumValues)[number];
  basis?: number | null;
  ratePct?: number | null;
  amount: number;
};

/** Profit(M) and its signed parts: the components (and expense categories) sum to `total`. */
export type MonthProfit = {
  month: string;
  total: number;
  components: Record<ProfitComponent, number>;
  expenses: Record<string, number>;
};

/** A month on the Months list: a closed month's profit is Σ its stored allocations. */
export type MonthRow = { month: string; profit: number; closed: boolean };

export type ProfitBooks = {
  months: MonthRow[];
  /** Per person: Σ allocations (closed months) − paid − reinvested (+ opening profit owed). */
  owed: Record<string, number>;
  /** Σ Profit(M) over the months not yet closed. */
  undistributed: number;
};

const effectsAsOf = (posted: Posted[], asOf: string) =>
  posted.filter((p) => p.date <= asOf).flatMap((p) => p.effects);

/** Profit(M) from the entries dated on or before `asOf`, with its breakdown (UIDD §4.9). */
export function monthProfit(posted: Posted[], month: string, asOf: string): MonthProfit {
  const m = monthOf(month);
  const components = Object.fromEntries(PROFIT_COMPONENTS.map((c) => [c, 0])) as Record<
    ProfitComponent,
    number
  >;
  const expenses: Record<string, number> = {};
  let total = 0;
  for (const e of effectsAsOf(posted, asOf)) {
    if (e.account !== "profit" || e.month !== m) continue;
    const component = e.component;
    if (!component) throw new Error("A profit effect without a component");
    total = add(total, e.amount);
    components[component] = add(components[component], e.amount);
    if (component === "expense") {
      const category = e.category ?? "other";
      expenses[category] = add(expenses[category] ?? 0, e.amount);
    }
  }
  return { month: m, total, components, expenses };
}

/**
 * Profit owed, undistributed profit and the Months list as of `asOf`. `closed` = the months with
 * a `month_closes` row; only those up to asOf's month count as closed.
 */
export function profitBooks(
  posted: Posted[],
  allocations: Allocation[],
  closed: string[],
  asOf: string,
): ProfitBooks {
  const closedSet = new Set(closed.map(monthOf).filter((m) => m <= monthOf(asOf)));
  const owed: Record<string, number> = {};
  const byMonth = new Map<string, number>();
  const credit = (map: Record<string, number>, id: string, amount: number) => {
    map[id] = add(map[id] ?? 0, amount);
  };

  for (const a of allocations) {
    const m = monthOf(a.month);
    if (!closedSet.has(m)) continue;
    credit(owed, a.personId, a.amount);
    byMonth.set(m, add(byMonth.get(m) ?? 0, a.amount));
  }
  for (const m of closedSet) if (!byMonth.has(m)) byMonth.set(m, 0);

  let undistributed = 0;
  for (const e of effectsAsOf(posted, asOf)) {
    if (e.account === "profit_owed" && e.id) credit(owed, e.id, e.amount);
    if (e.account !== "profit" || !e.month || closedSet.has(e.month)) continue;
    undistributed = add(undistributed, e.amount);
    byMonth.set(e.month, add(byMonth.get(e.month) ?? 0, e.amount));
  }

  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, profit]) => ({ month, profit, closed: closedSet.has(month) }));
  return { months, owed, undistributed };
}

/**
 * Closing M (SRS §7 step 3): R = Profit(M) − Σ investor allocations, split by the partners'
 * profit share % (`splitShares`, residual to the first partner; a loss goes negative). Returns
 * one `partner` allocation row per partner; with the investor rows they sum to Profit(M).
 */
export function computeClose(
  profit: Pick<MonthProfit, "month" | "total">,
  investorAllocations: Pick<Allocation, "amount">[],
  partners: Partner[],
): Allocation[] {
  if (partners.length === 0) throw new Error("Missing partners for the close");
  const investors = investorAllocations.reduce((sum, a) => add(sum, a.amount), 0);
  const shares = splitShares(
    sub(profit.total, investors),
    partners.map((p) => p.pct),
  );
  return partners.map((p, i) => ({
    month: profit.month,
    personId: p.id,
    kind: "partner",
    amount: shares[i],
  }));
}

/**
 * The next month to close (UIDD §3 "Closing: Oct 2026"; SRS §7: months close in order): the month
 * after the last closed one; with none closed, the first month with entries (the opening month,
 * SRS §9); with no entries, today's month.
 */
export function nextToClose(closed: string[], firstDate: string | null, today: string): string {
  const last = closed.map(monthOf).sort().at(-1);
  if (last) return addMonths(last, 1);
  return monthOf(firstDate ?? today);
}
