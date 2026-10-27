import { describe, expect, it } from "vitest";
import {
  type Effect,
  type Entry,
  type MoneyEntry,
  type Partner,
  type ProfitComponent,
  postEntry,
} from "@/lib/engine/post";
import { imbalance } from "./invariant";

// Synthetic ids only (D-014).
const CUST = "cust-1";
const SUPP = "supp-1";
const CARD = "card-1";
const ARIF = "person-arif";
const SUMON = "person-sumon";
const PARTNERS: Partner[] = [
  { id: ARIF, pct: 50 },
  { id: SUMON, pct: 50 },
];

const sortFx = (fx: Effect[]) =>
  [...fx].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const post = (entry: Entry) => sortFx(postEntry(entry, PARTNERS));

const D = "2026-10-07";
const OCT = "2026-10";
const money = (m: Omit<MoneyEntry, "table" | "date"> & { date?: string }): MoneyEntry => ({
  table: "money",
  date: D,
  ...m,
});

const lines = [
  { qty: 2, unitCost: 1_686_000 },
  { qty: 1, unitCost: 1_701_000 },
]; // T = 5,073,000 poisha (৳50,730)
const T = 5_073_000;

const cash = (amount: number): Effect => ({ account: "cash", amount });
const stock = (amount: number): Effect => ({ account: "stock", amount });
const on = (account: Effect["account"], id: string, amount: number): Effect => ({
  account,
  id,
  amount,
});
const profit = (
  amount: number,
  component: ProfitComponent,
  month = OCT,
  category?: string,
): Effect => ({ account: "profit", amount, month, component, ...(category ? { category } : {}) });

// One case per SRS §5 row (and sub-case). Each is [name, entry, expected effects].
const ROWS: [string, Entry, Effect[]][] = [
  // Purchases
  ["purchase: cash", { table: "purchase", date: D, source: "cash", lines }, [cash(-T), stock(T)]],
  [
    "purchase: card (EMI)",
    { table: "purchase", date: D, source: "card", cardId: CARD, emiMonths: 6, lines },
    [stock(T), on("card", CARD, T)],
  ],
  [
    "purchase: supplier credit",
    { table: "purchase", date: D, source: "supplier_credit", supplierId: SUPP, lines },
    [stock(T), on("supplier_due", SUPP, T)],
  ],
  [
    "purchase: customer offset",
    { table: "purchase", date: D, source: "customer_offset", customerId: CUST, lines },
    [stock(T), on("customer_due", CUST, -T)],
  ],
  // Sale: P = 3 × 18,000 = 54,000; C = 3 × 17,700 = 53,100 (S2)
  [
    "sale",
    {
      table: "sale",
      date: D,
      customerId: CUST,
      lines: [
        { qty: 2, unitPrice: 1_800_000, unitCost: 1_770_000 },
        { qty: 1, unitPrice: 1_800_000, unitCost: 1_770_000 },
      ],
    },
    [stock(-5_310_000), on("customer_due", CUST, 5_400_000), profit(90_000, "sale")],
  ],
  // Customer return (S3)
  [
    "customer return",
    {
      table: "return",
      kind: "customer",
      date: "2026-11-02",
      customerId: CUST,
      lines: [{ qty: 1, unitAmount: 1_800_000, unitCost: 1_770_000 }],
    },
    [
      stock(1_770_000),
      on("customer_due", CUST, -1_800_000),
      profit(-30_000, "customer_return", "2026-11"),
    ],
  ],
  // Purchase returns: R = 16,500, Cr = 17,000 → profit −500
  ...(
    [
      ["cash", {}, cash(1_650_000)],
      ["card", { cardId: CARD }, on("card", CARD, -1_650_000)],
      ["supplier", { supplierId: SUPP }, on("supplier_due", SUPP, -1_650_000)],
      ["customer", { customerId: CUST }, on("customer_due", CUST, 1_650_000)],
    ] as const
  ).map(([refundTo, target, refund]): [string, Entry, Effect[]] => [
    `purchase return: ${refundTo}`,
    {
      table: "return",
      kind: "purchase",
      date: D,
      refundTo,
      reason: "returned",
      ...target,
      lines: [{ qty: 1, unitAmount: 1_650_000, unitCost: 1_700_000 }],
    },
    [stock(-1_700_000), refund, profit(-50_000, "purchase_return")],
  ]),
  [
    "purchase return: damaged / lost (refund 0)",
    {
      table: "return",
      kind: "purchase",
      date: D,
      reason: "damaged_lost",
      lines: [{ qty: 1, unitAmount: 0, unitCost: 1_700_000 }],
    },
    [stock(-1_700_000), profit(-1_700_000, "purchase_return")],
  ],
  // Customer money
  [
    "customer payment",
    money({ type: "customer_payment", amount: 10_000_000, customerId: CUST }),
    [cash(10_000_000), on("customer_due", CUST, -10_000_000)],
  ],
  [
    "cash given to customer",
    money({ type: "customer_cash_given", amount: 500_000, customerId: CUST }),
    [cash(-500_000), on("customer_due", CUST, 500_000)],
  ],
  [
    "customer discount",
    money({ type: "customer_discount", amount: 5_000, customerId: CUST }),
    [on("customer_due", CUST, -5_000), profit(-5_000, "discount")],
  ],
  // Profit share for October, entered 3 Nov (S11, S12)
  [
    "profit share: received",
    money({
      type: "customer_profit_share",
      date: "2026-11-03",
      forMonth: "2026-10-01",
      amount: 28_467_500,
      customerId: CUST,
      settleMode: "received",
    }),
    [cash(28_467_500), profit(28_467_500, "profit_share")],
  ],
  [
    "profit share: added to due",
    money({
      type: "customer_profit_share",
      date: "2026-11-03",
      forMonth: "2026-10-01",
      amount: 28_467_500,
      customerId: CUST,
      settleMode: "added_to_due",
    }),
    [on("customer_due", CUST, 28_467_500), profit(28_467_500, "profit_share")],
  ],
  // Supplier / card
  [
    "supplier payment: cash",
    money({ type: "supplier_payment", amount: 10_000_000, supplierId: SUPP, source: "cash" }),
    [cash(-10_000_000), on("supplier_due", SUPP, -10_000_000)],
  ],
  [
    "supplier payment: card",
    money({
      type: "supplier_payment",
      amount: 10_000_000,
      supplierId: SUPP,
      source: "card",
      cardId: CARD,
    }),
    [on("card", CARD, 10_000_000), on("supplier_due", SUPP, -10_000_000)],
  ],
  [
    "card payment",
    money({ type: "card_payment", amount: 3_372_000, cardId: CARD }),
    [cash(-3_372_000), on("card", CARD, -3_372_000)],
  ],
  // S5: charged 100,000, received 98,500 → fee 1,500
  [
    "card cash-out",
    money({
      type: "card_cash_out",
      amount: 10_000_000,
      cardCharged: 10_000_000,
      cashReceived: 9_850_000,
      cardId: CARD,
    }),
    [cash(9_850_000), on("card", CARD, 10_000_000), profit(-150_000, "fee")],
  ],
  [
    "card fee",
    money({ type: "card_fee", amount: 75_000, cardId: CARD, category: "card fee/interest" }),
    [on("card", CARD, 75_000), profit(-75_000, "fee")],
  ],
  [
    "cashback: card",
    money({ type: "cashback", amount: 100_000, source: "card", cardId: CARD }),
    [on("card", CARD, -100_000), profit(100_000, "cashback")],
  ],
  [
    "cashback: cash",
    money({ type: "cashback", amount: 100_000, source: "cash" }),
    [cash(100_000), profit(100_000, "cashback")],
  ],
  // An expense dated 2 Nov for October counts in October.
  [
    "expense: cash",
    money({
      type: "expense",
      date: "2026-11-02",
      forMonth: "2026-10-01",
      amount: 500_000,
      category: "rent",
      source: "cash",
    }),
    [cash(-500_000), profit(-500_000, "expense", OCT, "rent")],
  ],
  [
    "expense: card",
    money({
      type: "expense",
      forMonth: OCT,
      amount: 500_000,
      category: "delivery",
      source: "card",
      cardId: CARD,
    }),
    [on("card", CARD, 500_000), profit(-500_000, "expense", OCT, "delivery")],
  ],
  // People
  [
    "capital in",
    money({ type: "capital_in", amount: 100_000_000, personId: ARIF }),
    [cash(100_000_000), on("capital", ARIF, 100_000_000)],
  ],
  [
    "capital out",
    money({ type: "capital_out", amount: 2_000_000, personId: ARIF }),
    [cash(-2_000_000), on("capital", ARIF, -2_000_000)],
  ],
  [
    "profit paid",
    money({ type: "profit_paid", amount: 4_000_000, personId: SUMON }),
    [cash(-4_000_000), on("profit_owed", SUMON, -4_000_000)],
  ],
  // S10
  [
    "profit reinvested",
    money({ type: "profit_reinvested", amount: 3_000_000, personId: SUMON }),
    [on("capital", SUMON, 3_000_000), on("profit_owed", SUMON, -3_000_000)],
  ],
];

// Opening correction (signed X; D = +X asset, −X liability, −X capital/profit owed).
const X = 2_000_000;
const diff = (d: number): Effect[] => [
  on("opening_diff", ARIF, d / 2),
  on("opening_diff", SUMON, d / 2),
];
const CORRECTIONS: [string, Entry, Effect[]][] = [
  [
    "opening correction: cash (asset)",
    money({ type: "opening_correction", openingKind: "cash", amount: X }),
    [cash(X), ...diff(X)],
  ],
  // S17: a missed Selim due of 20,000 → due +20,000, D = +20,000 (10,000 each)
  [
    "opening correction: customer due (asset)",
    money({ type: "opening_correction", openingKind: "customer_due", amount: X, customerId: CUST }),
    [on("customer_due", CUST, X), ...diff(X)],
  ],
  [
    "opening correction: supplier due (liability)",
    money({ type: "opening_correction", openingKind: "supplier_due", amount: X, supplierId: SUPP }),
    [on("supplier_due", SUPP, X), ...diff(-X)],
  ],
  [
    "opening correction: card balance (liability, negative X)",
    money({ type: "opening_correction", openingKind: "card_balance", amount: -X, cardId: CARD }),
    [on("card", CARD, -X), ...diff(X)],
  ],
  [
    "opening correction: capital",
    money({ type: "opening_correction", openingKind: "capital", amount: X, personId: ARIF }),
    [on("capital", ARIF, X), ...diff(-X)],
  ],
  [
    "opening correction: profit owed",
    money({ type: "opening_correction", openingKind: "profit_owed", amount: X, personId: SUMON }),
    [on("profit_owed", SUMON, X), ...diff(-X)],
  ],
  [
    "opening correction: a missed lot",
    { table: "purchase", date: D, source: "opening_correction", lines },
    [stock(T), ...diff(T)],
  ],
];

// Opening items are one-sided by nature (SRS §5): the import's opening difference balances them.
const OPENINGS: [string, Entry, Effect[]][] = [
  ["opening: cash", money({ type: "opening", openingKind: "cash", amount: X }), [cash(X)]],
  [
    "opening: customer due (credit)",
    money({ type: "opening", openingKind: "customer_due", amount: -X, customerId: CUST }),
    [on("customer_due", CUST, -X)],
  ],
  [
    "opening: supplier due",
    money({ type: "opening", openingKind: "supplier_due", amount: X, supplierId: SUPP }),
    [on("supplier_due", SUPP, X)],
  ],
  [
    "opening: card balance",
    money({
      type: "opening",
      openingKind: "card_balance",
      amount: X,
      cardId: CARD,
      billMonthOverride: "2026-10-01",
      emiMonths: 3,
    }),
    [on("card", CARD, X)],
  ],
  [
    "opening: capital",
    money({ type: "opening", openingKind: "capital", amount: X, personId: ARIF }),
    [on("capital", ARIF, X)],
  ],
  [
    "opening: profit owed",
    money({ type: "opening", openingKind: "profit_owed", amount: X, personId: ARIF }),
    [on("profit_owed", ARIF, X)],
  ],
  [
    "opening: opening difference",
    money({ type: "opening", openingKind: "opening_difference", amount: -X, personId: SUMON }),
    [on("opening_diff", SUMON, -X)],
  ],
  ["opening: stock lots", { table: "purchase", date: D, source: "opening", lines }, [stock(T)]],
];

const ALL = [...ROWS, ...CORRECTIONS, ...OPENINGS];
const BALANCED = [...ROWS, ...CORRECTIONS];

describe("postEntry (SRS §5)", () => {
  describe("U2.3.1 one test per SRS §5 row", () => {
    it.each(ALL)("%s", (_name, entry, expected) => {
      expect(post(entry)).toEqual(sortFx(expected));
    });

    it("never returns a zero effect (a sale at cost has no profit line)", () => {
      const fx = post({
        table: "sale",
        date: D,
        customerId: CUST,
        lines: [{ qty: 1, unitPrice: 1_700_000, unitCost: 1_700_000 }],
      });
      expect(fx).toEqual(sortFx([stock(-1_700_000), on("customer_due", CUST, 1_700_000)]));
    });

    it("splits the opening difference by profit share, residual to the first partner", () => {
      const fx = post(money({ type: "opening_correction", openingKind: "cash", amount: 1 }));
      // 1 poisha @ 50/50: pct(1, 50%) = 1 to Sumon, residual 0 to Arif (dropped as zero).
      expect(fx).toEqual(sortFx([cash(1), on("opening_diff", SUMON, 1)]));
    });

    it("rejects an entry missing its target or setting", () => {
      expect(() => post({ table: "purchase", date: D, source: "card", lines })).toThrow(/card/);
      expect(() => post(money({ type: "customer_payment", amount: 1 }))).toThrow(/customer/);
      expect(() => post(money({ type: "expense", amount: 1, forMonth: OCT }))).toThrow(/source/);
      expect(() =>
        post(
          money({
            type: "opening_correction",
            openingKind: "opening_difference",
            amount: 1,
            personId: ARIF,
          }),
        ),
      ).toThrow(/opening_difference/);
      expect(() =>
        postEntry(money({ type: "opening_correction", openingKind: "cash", amount: 1 }), []),
      ).toThrow(/partner/);
    });
  });

  describe("U2.3.2 reversal = −(original effects), in the reversal's own date/for_month", () => {
    it.each(ALL)("%s", (_name, entry) => {
      const reversed = post({ ...entry, reversesId: "orig-1" });
      const negated = post(entry).map((e) => ({ ...e, amount: 0 - e.amount }));
      expect(reversed).toEqual(negated);
      expect(reversed.every((e) => !Object.is(e.amount, -0))).toBe(true);
    });

    it("S18: an October expense reversed on 3 Nov for November lands in November", () => {
      const fx = post(
        money({
          type: "expense",
          date: "2026-11-03",
          forMonth: "2026-11-01",
          amount: 500_000,
          category: "rent",
          source: "cash",
          reversesId: "orig-1",
        }),
      );
      expect(fx).toEqual(sortFx([cash(500_000), profit(500_000, "expense", "2026-11", "rent")]));
    });
  });

  describe("U2.3.3 each row balances: Δassets − Δliabilities = Δequity", () => {
    it.each(BALANCED)("%s", (_name, entry) => {
      expect(imbalance(post(entry))).toBe(0);
      expect(imbalance(post({ ...entry, reversesId: "orig-1" }))).toBe(0);
    });

    it("opening items are one-sided (the import's opening difference balances them)", () => {
      for (const [, entry] of OPENINGS) expect(imbalance(post(entry))).not.toBe(0);
    });
  });
});
