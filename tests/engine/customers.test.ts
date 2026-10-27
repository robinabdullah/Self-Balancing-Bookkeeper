import { describe, expect, it } from "vitest";
import { aboveTarget, dueStatements } from "@/lib/engine/customers";
import { type Account, type Effect, type MoneyEntry, type Posted } from "@/lib/engine/post";
import { type Lot, lotsRemaining, pickLots } from "@/lib/engine/stock";
import { splitShares } from "@/lib/money";
import { PARTNERS, expectBalanced, posted } from "./invariant";

// Synthetic ids only (D-014).
const MILON = "cust-milon";
const SELIM = "cust-selim";
const SUPP = "supp-1";
const VIVO = "model-vivo";
const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
/** An opening customer due plus the import's opening difference, so the books balance. */
const openingDue = (customerId: string, amount: number, date = "2026-10-01"): Posted[] => [
  posted(money({ type: "opening", openingKind: "customer_due", customerId, amount, date })),
  ...splitShares(
    amount,
    PARTNERS.map((p) => p.pct),
  ).map((share, i) =>
    posted(
      money({
        type: "opening",
        openingKind: "opening_difference",
        personId: PARTNERS[i].id,
        amount: share,
        date,
      }),
    ),
  ),
];

const all = (entries: Posted[]) => entries.flatMap((e) => e.effects);
const total = (entries: Posted[], account: Account, match: Partial<Effect> = {}) =>
  all(entries)
    .filter((e) => e.account === account)
    .filter((e) => (match.id ? e.id === match.id : true))
    .filter((e) => (match.month ? e.month === match.month : true))
    .reduce((n, e) => n + e.amount, 0);

// S1–S3 share one story: 10 Vivo on supplier credit, a payment, a sale to Milon, a return.
const LOT: Lot = {
  id: "lot-1",
  modelId: VIVO,
  date: "2026-10-01",
  createdAt: "2026-10-01T09:00:00Z",
  qty: 10,
  unitCost: 1_770_000, // ৳17,700
};
const buy = posted({
  table: "purchase",
  date: "2026-10-01",
  source: "supplier_credit",
  supplierId: SUPP,
  lines: [{ qty: LOT.qty, unitCost: LOT.unitCost }],
});
const pay = posted(
  money({
    type: "supplier_payment",
    date: "2026-10-02",
    supplierId: SUPP,
    source: "cash",
    amount: 10_000_000,
  }),
);
const picks = pickLots(lotsRemaining([LOT], []), VIVO, 3, "2026-10-05");
const sell = posted({
  table: "sale",
  date: "2026-10-05",
  customerId: MILON,
  lines: picks.map((p) => ({ qty: p.qty, unitCost: p.unitCost, unitPrice: 1_800_000 })),
});
const giveBack = posted({
  table: "return",
  kind: "customer",
  date: "2026-11-02",
  customerId: MILON,
  lines: [{ qty: 1, unitAmount: 1_800_000, unitCost: LOT.unitCost }],
});

describe("U2.5.1 S1: supplier-credit purchase, then a payment", () => {
  const story = [buy, pay];

  it("stock +৳1,77,000; supplier owed ৳77,000", () => {
    expect(total(story, "stock")).toBe(17_700_000);
    const s = dueStatements(story, "supplier_due", "2026-10-31")[SUPP];
    expect(s.balance).toBe(7_700_000);
    expect(s.rows).toEqual([
      { entryId: buy.id, date: "2026-10-01", amount: 17_700_000, balance: 17_700_000 },
      { entryId: pay.id, date: "2026-10-02", amount: -10_000_000, balance: 7_700_000 },
    ]);
    expectBalanced(story);
  });

  it("as of the purchase day, the payment isn't counted yet; input order doesn't matter", () => {
    const s = dueStatements([pay, buy], "supplier_due", "2026-10-01")[SUPP];
    expect(s.balance).toBe(17_700_000);
    expect(s.rows.map((r) => r.entryId)).toEqual([buy.id]);
  });
});

describe("U2.5.2 S2: sell 3 to Milon at ৳18,000", () => {
  const story = [buy, pay, sell];

  it("due +৳54,000; stock −৳53,100; profit +৳900 in the sale month", () => {
    expect(total([sell], "stock")).toBe(-5_310_000);
    expect(total([sell], "profit", { month: "2026-10" })).toBe(90_000);
    const s = dueStatements(story, "customer_due", "2026-10-31")[MILON];
    expect(s.balance).toBe(5_400_000);
    expect(s.rows).toEqual([
      { entryId: sell.id, date: "2026-10-05", amount: 5_400_000, balance: 5_400_000 },
    ]);
    expectBalanced(story);
  });
});

describe("U2.5.3 S3: Milon returns 1 unit", () => {
  const story = [buy, pay, sell, giveBack];

  it("due −৳18,000; stock +৳17,700; profit −৳300 in the return month", () => {
    expect(total([giveBack], "customer_due", { id: MILON })).toBe(-1_800_000);
    expect(total([giveBack], "stock")).toBe(1_770_000);
    expect(total([giveBack], "profit", { month: "2026-11" })).toBe(-30_000);
    expect(total(story, "profit", { month: "2026-10" })).toBe(90_000); // the sale month is untouched
    const s = dueStatements(story, "customer_due", "2026-11-30")[MILON];
    expect(s.balance).toBe(3_600_000);
    expect(s.rows.at(-1)).toEqual({
      entryId: giveBack.id,
      date: "2026-11-02",
      amount: -1_800_000,
      balance: 3_600_000,
    });
    expectBalanced(story);
  });
});

describe("U2.5.4 S13: pays ৳99,950 of ৳1,00,000, ৳50 as a discount", () => {
  const story = [
    ...openingDue(SELIM, 10_000_000),
    posted(
      money({
        type: "customer_payment",
        date: "2026-10-10",
        customerId: SELIM,
        amount: 9_995_000,
      }),
    ),
    posted(
      money({ type: "customer_discount", date: "2026-10-10", customerId: SELIM, amount: 5_000 }),
    ),
  ];

  it("due 0; profit −৳50 in that month", () => {
    const s = dueStatements(story, "customer_due", "2026-10-31")[SELIM];
    expect(s.balance).toBe(0);
    expect(s.rows.map((r) => r.balance)).toEqual([10_000_000, 5_000, 0]);
    expect(total(story, "profit", { month: "2026-10" })).toBe(-5_000);
    expectBalanced(story);
  });
});

describe("U2.5.5 S15: buy 2 at ৳15,000 from Selim against his ৳1,00,000 due", () => {
  const offset = posted({
    table: "purchase",
    date: "2026-10-12",
    source: "customer_offset",
    customerId: SELIM,
    lines: [{ qty: 2, unitCost: 1_500_000 }],
  });
  const story = [...openingDue(SELIM, 10_000_000), offset];

  it("stock +৳30,000; due ৳70,000; cash unchanged", () => {
    expect(total([offset], "stock")).toBe(3_000_000);
    expect(total(story, "cash")).toBe(0);
    expect(dueStatements(story, "customer_due", "2026-10-31")[SELIM].balance).toBe(7_000_000);
    expectBalanced(story);
  });
});

describe("U2.5.6 overpayment and above target", () => {
  it("overpaying leaves a negative due (customer credit)", () => {
    const story = [
      sell,
      posted(
        money({
          type: "customer_payment",
          date: "2026-10-06",
          customerId: MILON,
          amount: 6_000_000,
        }),
      ),
    ];
    expect(dueStatements(story, "customer_due", "2026-10-31")[MILON].balance).toBe(-600_000);
  });

  it("above target = balance − target; none without a target", () => {
    const target = 600_000_000; // ৳60,00,000
    expect(aboveTarget(605_000_000, target)).toBe(5_000_000);
    expect(aboveTarget(-600_000, target)).toBe(-600_600_000);
    expect(aboveTarget(5_400_000, null)).toBeNull();
    expect(aboveTarget(5_400_000, undefined)).toBeNull();
  });

  it("a customer with no entries isn't listed", () => {
    expect(dueStatements([buy], "customer_due", "2026-10-31")).toEqual({});
  });
});
