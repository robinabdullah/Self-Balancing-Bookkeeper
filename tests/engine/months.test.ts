import { describe, expect, it } from "vitest";
import { type Allocation, computeClose, monthProfit, profitBooks } from "@/lib/engine/months";
import { type Account, type MoneyEntry, type Posted } from "@/lib/engine/post";
import { pct } from "@/lib/money";
import { PARTNERS, expectBalanced, posted } from "./invariant";

// Synthetic ids only (D-014).
const ARIF = "person-arif";
const SUMON = "person-sumon";
const INVESTOR = "person-investor";
const MILON = "cust-milon";
const CARD = "card-1";
const OCT = "2026-10";
const NOV = "2026-11";

const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const total = (entries: Posted[], account: Account, id?: string) =>
  entries
    .flatMap((p) => p.effects)
    .filter((e) => e.account === account && (id ? e.id === id : true))
    .reduce((n, e) => n + e.amount, 0);
/** Arif's capital buys one phone for ৳500,000 and sells it to Milon on `date` for `price`. */
const tradeMonth = (price: number, date = "2026-10-15"): Posted[] => [
  posted(money({ type: "capital_in", date: "2026-10-01", amount: 50_000_000, personId: ARIF })),
  posted({
    table: "purchase",
    date: "2026-10-02",
    source: "cash",
    lines: [{ qty: 1, unitCost: 50_000_000 }],
  }),
  posted({
    table: "sale",
    date,
    customerId: MILON,
    lines: [{ qty: 1, unitPrice: price, unitCost: 50_000_000 }],
  }),
];

/** An investor's cash allocation: basis × rate (SRS §4), the amount the close form defaults to. */
const investorCash = (month: string, basis: number, ratePct: number): Allocation => ({
  month,
  personId: INVESTOR,
  kind: "cash",
  basis,
  ratePct,
  amount: pct(basis, ratePct),
});

/** Closes `month` as the close action will: investor rows + computeClose's partner rows. */
const close = (entries: Posted[], month: string, asOf: string, investors: Allocation[]) => [
  ...investors,
  ...computeClose(monthProfit(entries, month, asOf), investors, PARTNERS),
];
const amountOf = (rows: Allocation[], personId: string) =>
  rows.filter((r) => r.personId === personId).reduce((n, r) => n + r.amount, 0);

describe("2.7.1 Profit(M) by date or for_month, with a breakdown", () => {
  it("breaks October down by component and expense category; the parts sum to the total", () => {
    const entries = [
      ...tradeMonth(60_000_000), // sale profit ৳100,000
      posted(
        money({ type: "customer_discount", date: "2026-10-20", amount: 5_000, customerId: MILON }),
      ),
      posted(
        money({
          type: "customer_profit_share",
          date: "2026-11-03",
          forMonth: "2026-10-01",
          amount: 28_467_500,
          customerId: MILON,
          settleMode: "received",
        }),
      ),
      posted(money({ type: "cashback", date: "2026-10-21", amount: 100_000, source: "cash" })),
      posted(
        money({
          type: "card_cash_out",
          date: "2026-10-22",
          amount: 10_000_000,
          cardCharged: 10_000_000,
          cashReceived: 9_850_000,
          cardId: CARD,
        }),
      ),
      posted(money({ type: "card_fee", date: "2026-10-23", amount: 75_000, cardId: CARD })),
      posted(
        money({
          type: "expense",
          date: "2026-10-24",
          forMonth: "2026-10-01",
          amount: 500_000,
          category: "rent",
          source: "cash",
        }),
      ),
      posted(
        money({
          type: "expense",
          date: "2026-10-25",
          forMonth: "2026-10-01",
          amount: 200_000,
          category: "delivery",
          source: "cash",
        }),
      ),
    ];
    const asOf = "2026-11-05";
    const oct = monthProfit(entries, OCT, asOf);

    expect(oct.components).toEqual({
      sale: 10_000_000,
      customer_return: 0,
      discount: -5_000,
      profit_share: 28_467_500,
      cashback: 100_000,
      expense: -700_000,
      fee: -225_000,
      purchase_return: 0,
    });
    expect(oct.expenses).toEqual({ rent: -500_000, delivery: -200_000 });
    expect(oct.total).toBe(Object.values(oct.components).reduce((n, x) => n + x, 0));
    expect(oct.total).toBe(37_637_500);
    // As of 31 Oct the profit share (dated 3 Nov) is not in yet.
    expect(monthProfit(entries, OCT, "2026-10-31").total).toBe(37_637_500 - 28_467_500);
    expectBalanced(entries, asOf);
  });

  it("U2.7.7 an expense dated 2 Nov for October counts in October", () => {
    const entries = [
      posted(
        money({ type: "capital_in", date: "2026-10-01", amount: 10_000_000, personId: ARIF }),
      ),
      posted(
        money({
          type: "expense",
          date: "2026-11-02",
          forMonth: "2026-10-01",
          amount: 3_000_000,
          category: "salary",
          source: "cash",
        }),
      ),
    ];
    const oct = monthProfit(entries, OCT, "2026-11-02");
    expect(oct.total).toBe(-3_000_000);
    expect(oct.expenses).toEqual({ salary: -3_000_000 });
    expect(monthProfit(entries, NOV, "2026-11-02").total).toBe(0);
    expectBalanced(entries, "2026-11-02");
  });
});

describe("2.7.3 computeClose: investors first, the remainder split by profit share %", () => {
  it("U2.7.1 S8: profit 100,000, investors 20,000 → each partner 40,000", () => {
    const entries = tradeMonth(60_000_000);
    const investors = [investorCash(OCT, 100_000_000, 2)]; // ৳10,00,000 × 2% = ৳20,000
    const rows = close(entries, OCT, "2026-10-31", investors);

    expect(rows.filter((r) => r.kind === "partner")).toEqual([
      { month: OCT, personId: ARIF, kind: "partner", amount: 4_000_000 },
      { month: OCT, personId: SUMON, kind: "partner", amount: 4_000_000 },
    ]);
    expect(amountOf(rows, INVESTOR)).toBe(2_000_000);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(10_000_000); // Σ = Profit(M)

    const books = profitBooks(entries, rows, [OCT], "2026-11-01");
    expect(books.owed).toEqual({ [INVESTOR]: 2_000_000, [ARIF]: 4_000_000, [SUMON]: 4_000_000 });
    expect(books.undistributed).toBe(0);
    expectBalanced(entries, "2026-10-31"); // before the close
    expectBalanced(entries, "2026-11-01", rows, [OCT]); // after
  });

  it("U2.7.2 S9: loss −10,000, investors 2,000 → each partner −6,000", () => {
    const entries = [
      posted(money({ type: "capital_in", date: "2026-10-01", amount: 5_000_000, personId: ARIF })),
      posted(
        money({
          type: "expense",
          date: "2026-10-10",
          forMonth: "2026-10-01",
          amount: 1_000_000,
          category: "rent",
          source: "cash",
        }),
      ),
    ];
    const investors = [investorCash(OCT, 10_000_000, 2)]; // ৳1,00,000 × 2% = ৳2,000
    const rows = close(entries, OCT, "2026-10-31", investors);

    expect(amountOf(rows, ARIF)).toBe(-600_000);
    expect(amountOf(rows, SUMON)).toBe(-600_000);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(-1_000_000);
    expectBalanced(entries, "2026-11-01", rows, [OCT]);
  });

  it("an odd poisha still sums to exactly Profit(M) (splitShares residual)", () => {
    const rows = computeClose({ month: OCT, total: 1 }, [], PARTNERS);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(1);
  });
});

describe("2.7.2 profit owed and undistributed profit", () => {
  it("U2.7.3 S10: reinvest 30,000 → profit owed −30,000; capital +30,000; cash unchanged", () => {
    const entries = tradeMonth(60_000_000);
    const rows = close(entries, OCT, "2026-10-31", [investorCash(OCT, 100_000_000, 2)]);
    const reinvest = posted(
      money({ type: "profit_reinvested", date: "2026-11-02", amount: 3_000_000, personId: ARIF }),
    );
    const after = [...entries, reinvest];

    const before = profitBooks(entries, rows, [OCT], "2026-11-02").owed[ARIF];
    expect(profitBooks(after, rows, [OCT], "2026-11-02").owed[ARIF]).toBe(before - 3_000_000);
    expect(total([reinvest], "capital", ARIF)).toBe(3_000_000);
    expect(total([reinvest], "cash")).toBe(0);
    expectBalanced(after, "2026-11-02", rows, [OCT]);
  });

  it("owed = Σ allocations − paid − reinvested + opening; a closed month shows its stored rows", () => {
    const entries = [
      posted(
        money({ type: "opening", openingKind: "cash", date: "2026-09-30", amount: 1_000_000 }),
      ),
      posted(
        money({
          type: "opening",
          openingKind: "profit_owed",
          date: "2026-09-30",
          amount: 1_000_000,
          personId: SUMON,
        }),
      ),
      ...tradeMonth(60_000_000),
    ];
    const rows = close(entries, OCT, "2026-10-31", []);
    const paid = posted(
      money({ type: "profit_paid", date: "2026-11-03", amount: 4_000_000, personId: SUMON }),
    );
    const after = [...entries, paid];
    const books = profitBooks(after, rows, [OCT], "2026-11-04");

    expect(books.owed[SUMON]).toBe(5_000_000 - 4_000_000 + 1_000_000);
    expect(books.owed[ARIF]).toBe(5_000_000);
    expect(books.months).toEqual([{ month: OCT, profit: 10_000_000, closed: true }]);
    expectBalanced(after, "2026-11-04", rows, [OCT]);
  });

  it("U2.7.4 S11: profit share 284,675 for October, received 3 Nov → October profit; cash on 3 Nov", () => {
    const share = posted(
      money({
        type: "customer_profit_share",
        date: "2026-11-03",
        forMonth: "2026-10-01",
        amount: 28_467_500,
        customerId: MILON,
        settleMode: "received",
      }),
    );
    const entries = [...tradeMonth(60_000_000), share];

    expect(monthProfit(entries, OCT, "2026-11-03").components.profit_share).toBe(28_467_500);
    expect(monthProfit(entries, NOV, "2026-11-03").total).toBe(0);
    expect(total([share], "cash")).toBe(28_467_500);
    expect(total([share], "customer_due", MILON)).toBe(0);
    expectBalanced(entries, "2026-11-03");
  });

  it("U2.7.5 S12: the same, added to due → October profit +284,675; Milon's due +284,675", () => {
    const share = posted(
      money({
        type: "customer_profit_share",
        date: "2026-11-03",
        forMonth: "2026-10-01",
        amount: 28_467_500,
        customerId: MILON,
        settleMode: "added_to_due",
      }),
    );
    const entries = [...tradeMonth(60_000_000), share];

    expect(monthProfit(entries, OCT, "2026-11-03").components.profit_share).toBe(28_467_500);
    expect(total([share], "customer_due", MILON)).toBe(28_467_500);
    expect(total([share], "cash")).toBe(0);
    expectBalanced(entries, "2026-11-03");
  });

  it("U2.7.6 S18: an October expense reversed on 3 Nov, October closed → November +5,000", () => {
    const rent = {
      type: "expense",
      forMonth: "2026-10-01",
      amount: 500_000,
      category: "rent",
      source: "cash",
    } as const;
    const entries = [
      posted(money({ type: "capital_in", date: "2026-10-01", amount: 1_000_000, personId: ARIF })),
      posted(money({ ...rent, date: "2026-10-20" })),
    ];
    const rows = close(entries, OCT, "2026-10-31", []);
    const reversal = posted(
      money({ ...rent, date: "2026-11-03", forMonth: "2026-11-01", reversesId: entries[1].id }),
    );
    const after = [...entries, reversal];
    const books = profitBooks(after, rows, [OCT], "2026-11-03");

    expect(monthProfit(after, NOV, "2026-11-03").total).toBe(500_000);
    expect(books.months).toEqual([
      { month: OCT, profit: -500_000, closed: true },
      { month: NOV, profit: 500_000, closed: false },
    ]);
    expect(books.owed).toEqual({ [ARIF]: -250_000, [SUMON]: -250_000 }); // October unchanged
    expect(books.undistributed).toBe(500_000);
    expectBalanced(after, "2026-11-03", rows, [OCT]);
  });
});
