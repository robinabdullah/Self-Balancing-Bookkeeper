// Balance (SRS §5): the books' totals, the books-balance invariant, the opening difference and the
// cash warning (D-018). Every amount comes from `postEntry` effects; profit owed and undistributed
// profit come from `profitBooks` (closed months use their stored allocations). Pure; integer poisha.
import type { ProfitBooks } from "./months";
import type { Account, Posted } from "./post";
import { add, sub } from "../money";

/** Opening difference (capital booked by the import or by corrections), shown until resolved. */
export type OpeningDifference = {
  byPerson: Record<string, number>;
  total: number;
  /** Its net total, corrections included, is 0 (SRS §5). */
  resolved: boolean;
};

/**
 * Both sides of the invariant (SRS §5), all terms signed:
 * Cash + Stock + Σ customer dues − Σ card balances − Σ supplier dues
 *   = Σ capital (incl. opening difference) + Σ profit owed + undistributed profit.
 * `difference` = net assets − equity; 0 = ✓.
 */
export type Invariant = { netAssets: number; equity: number; difference: number };

export type Balance = {
  cash: number;
  stock: number;
  customerDues: number;
  supplierDues: number;
  cardBalances: number;
  /** Per person, without the opening difference. */
  capital: Record<string, number>;
  openingDifference: OpeningDifference;
  profitOwed: Record<string, number>;
  undistributed: number;
  invariant: Invariant;
  /** The first date running cash went below 0, or null (D-018). */
  firstNegativeCash: string | null;
};

const total = (byId: Record<string, number>) => Object.values(byId).reduce(add, 0);

/** The balance as of `asOf`, from the entries dated on or before it. */
export function balance(
  posted: Posted[],
  profit: Pick<ProfitBooks, "owed" | "undistributed">,
  asOf: string,
): Balance {
  const sums: Partial<Record<Account, number>> = {};
  const capital: Record<string, number> = {};
  const openingDiff: Record<string, number> = {};
  const cashByDate = new Map<string, number>();

  for (const p of posted) {
    if (p.date > asOf) continue;
    for (const e of p.effects) {
      sums[e.account] = add(sums[e.account] ?? 0, e.amount);
      if (e.account === "capital" && e.id) capital[e.id] = add(capital[e.id] ?? 0, e.amount);
      if (e.account === "opening_diff" && e.id) {
        openingDiff[e.id] = add(openingDiff[e.id] ?? 0, e.amount);
      }
      if (e.account === "cash") cashByDate.set(p.date, add(cashByDate.get(p.date) ?? 0, e.amount));
    }
  }

  const get = (account: Account) => sums[account] ?? 0;
  const diffTotal = total(openingDiff);
  const netAssets = sub(
    add(add(get("cash"), get("stock")), get("customer_due")),
    add(get("card"), get("supplier_due")),
  );
  const equity = add(add(add(total(capital), diffTotal), total(profit.owed)), profit.undistributed);

  return {
    cash: get("cash"),
    stock: get("stock"),
    customerDues: get("customer_due"),
    supplierDues: get("supplier_due"),
    cardBalances: get("card"),
    capital,
    openingDifference: { byPerson: openingDiff, total: diffTotal, resolved: diffTotal === 0 },
    profitOwed: profit.owed,
    undistributed: profit.undistributed,
    invariant: { netAssets, equity, difference: sub(netAssets, equity) },
    firstNegativeCash: firstNegative(cashByDate),
  };
}

/** Running cash at the end of each date, oldest first; dates carry no time (SRS §3). */
function firstNegative(cashByDate: Map<string, number>): string | null {
  let running = 0;
  for (const date of [...cashByDate.keys()].sort()) {
    running = add(running, cashByDate.get(date) ?? 0);
    if (running < 0) return date;
  }
  return null;
}
