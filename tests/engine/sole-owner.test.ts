import { describe, expect, it } from "vitest";
import { type Allocation, computeClose, monthProfit, profitBooks } from "@mbl/domain/engine/months";
import { type MoneyEntry, type Partner, type Posted } from "@mbl/domain/engine/post";
import { pct } from "@mbl/domain/money";
import { expectBalanced, imbalance, posted } from "./invariant";

// CR-050 (D-073): a sole owner is one partner at 100%. Synthetic ids only (D-014).
const OWNER = "person-owner";
const SOLE: Partner[] = [{ id: OWNER, pct: 100 }];
const INVESTOR = "person-investor";
const OCT = "2026-10";

const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const own = (m: Omit<MoneyEntry, "table">): Posted => posted(money(m), SOLE);
const investorCash = (basis: number, ratePct: number): Allocation => ({
  month: OCT,
  personId: INVESTOR,
  kind: "cash",
  basis,
  ratePct,
  amount: pct(basis, ratePct),
});
/** The owner's capital buys one phone for ৳500,000 and sells it on 15 Oct for `price`. */
const tradeMonth = (price: number): Posted[] => [
  own({ type: "capital_in", date: "2026-10-01", amount: 50_000_000, personId: OWNER }),
  posted(
    {
      table: "purchase",
      date: "2026-10-02",
      source: "cash",
      lines: [{ qty: 1, unitCost: 50_000_000 }],
    },
    SOLE,
  ),
  posted(
    {
      table: "sale",
      date: "2026-10-15",
      customerId: "cust-1",
      lines: [{ qty: 1, unitPrice: price, unitCost: 50_000_000 }],
    },
    SOLE,
  ),
];
const close = (entries: Posted[], investors: Allocation[]) => [
  ...investors,
  ...computeClose(monthProfit(entries, OCT, "2026-10-31"), investors, SOLE),
];

describe("CR-050 a sole owner (one partner at 100%)", () => {
  it("U-CR-050.1 profit 100,000, investors 20,000 → the owner is allocated 80,000; books balance", () => {
    const entries = tradeMonth(60_000_000);
    const rows = close(entries, [investorCash(100_000_000, 2)]); // ৳10,00,000 × 2% = ৳20,000

    expect(rows.filter((r) => r.kind === "partner")).toEqual([
      { month: OCT, personId: OWNER, kind: "partner", amount: 8_000_000 },
    ]);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(10_000_000); // Σ = Profit(M)
    const books = profitBooks(entries, rows, [OCT], "2026-11-01");
    expect(books.owed).toEqual({ [INVESTOR]: 2_000_000, [OWNER]: 8_000_000 });
    expect(books.undistributed).toBe(0);
    expectBalanced(entries, "2026-11-01", rows, [OCT]);
  });

  it("U-CR-050.2 a loss goes to the owner whole, and an odd poisha is not lost", () => {
    const loss = computeClose({ month: OCT, total: -1_000_001 }, [], SOLE);
    expect(loss).toEqual([{ month: OCT, personId: OWNER, kind: "partner", amount: -1_000_001 }]);
  });

  it("U-CR-050.3 an opening correction posts the whole opening difference to the owner", () => {
    const fix = own({
      type: "opening_correction",
      openingKind: "cash",
      date: "2026-10-10",
      amount: 1_234_567,
    });
    const diff = fix.effects.filter((e) => e.account === "opening_diff");
    expect(diff).toEqual([expect.objectContaining({ id: OWNER, amount: 1_234_567 })]);
    expect(imbalance(fix.effects)).toBe(0);
  });
});
