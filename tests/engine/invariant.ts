import { expect } from "vitest";
import { balance } from "@mbl/domain/engine/balance";
import { toPosted } from "@mbl/domain/engine/index";
import { type Allocation, profitBooks } from "@mbl/domain/engine/months";
import type { Effect, Entry, Partner, Posted } from "@mbl/domain/engine/post";
import { SIDE } from "@mbl/domain/engine/post";

// Synthetic ids only (D-014).
export const PARTNERS: Partner[] = [
  { id: "person-arif", pct: 50 },
  { id: "person-sumon", pct: 50 },
];

let seq = 0;
/** Posts the entry like computeBooks does: a new id, created_at order, `toPosted`. */
export function posted(entry: Entry, partners: Partner[] = PARTNERS): Posted {
  seq += 1;
  const createdAt = `${entry.date}T10:00:00.${String(seq).padStart(3, "0")}Z`;
  return toPosted({ ...entry, id: `e-${seq}`, createdAt }, partners);
}

/** Assets − liabilities − equity moved by these effects (0 = this one row balances). */
export function imbalance(fx: Effect[]): number {
  return fx.reduce((sum, e) => {
    const side = SIDE[e.account];
    return sum + (side === "asset" ? e.amount : 0 - e.amount);
  }, 0);
}

/**
 * S16: the books-balance invariant (SRS §5) as the engine computes it, with month closes. The one
 * assert every scenario test uses. `asOf` defaults to the latest entry's date.
 */
export function expectBalanced(
  entries: Posted[],
  asOf?: string,
  allocations: Allocation[] = [],
  closed: string[] = [],
): void {
  const date = asOf ?? entries.reduce((max, p) => (p.date > max ? p.date : max), "");
  const profit = profitBooks(entries, allocations, closed, date);
  expect(balance(entries, profit, date).invariant.difference).toBe(0);
}
