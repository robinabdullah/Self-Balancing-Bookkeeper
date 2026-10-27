import { describe, expect, it } from "vitest";
import { moneyType, openingKind, purchaseSource, refundTo } from "@/db/schema";
import { entryConfirm } from "@mbl/domain/confirms";
import {
  type Posting,
  billOf,
  deleteRows,
  didRows,
  effectRows,
  netEffects,
  reversalRows,
  signed,
} from "@mbl/domain/effect-rows";
import type { Card } from "@mbl/domain/engine/cards";
import type { StoredEntry } from "@mbl/domain/engine/index";
import {
  type Effect,
  type Entry,
  type MoneyEntry,
  type PurchaseEntry,
  postEntry,
} from "@mbl/domain/engine/post";
import { add } from "@mbl/domain/money";
import { PARTNERS, expectBalanced, imbalance, posted } from "./invariant";

// CR-036 (D-061; UIDD §3, §4.10, §5): one row style for what an entry does. The rows are the
// entry's own postEntry effects, netted per account; a card charge names its bill; the confirms
// add only a sentence and notes. Synthetic ids and amounts only (D-014).

const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";
const CITY: Card = { id: "card-city", statementDay: 27, dueDay: 12 };
const names = {
  [ARIF]: "Arif",
  [SUMON]: "Sumon",
  [CUST]: "Test Telecom (Jamal)",
  [SUPP]: "Test Supplier",
  [CITY.id]: "Arif · City Amex",
};
const ctx = { names, cards: [CITY], billDates: [] };
const A = 1_000_000; // ৳10,000

const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const purchase = (source: PurchaseEntry["source"], more: Partial<PurchaseEntry> = {}) =>
  ({
    table: "purchase",
    date: "2026-10-20",
    source,
    cardId: CITY.id,
    supplierId: SUPP,
    customerId: CUST,
    lines: [{ qty: 2, unitCost: A / 2 }],
    ...more,
  }) as PurchaseEntry;
const lines = [{ qty: 1, unitAmount: 1_200_000, unitCost: A }];

/** Every posting type (SRS §5), each with everything its rule may need. */
const EVERY: Entry[] = [
  ...purchaseSource.enumValues.map((s) => purchase(s)),
  purchase("card", { emiMonths: 5 }),
  {
    table: "sale",
    date: "2026-10-20",
    customerId: CUST,
    lines: [{ qty: 2, unitPrice: 1_200_000, unitCost: A }],
  },
  { table: "return", kind: "customer", date: "2026-10-20", customerId: CUST, lines },
  ...refundTo.enumValues.map((to): Entry => ({
    table: "return",
    kind: "purchase",
    date: "2026-10-20",
    refundTo: to,
    reason: "returned",
    customerId: CUST,
    supplierId: SUPP,
    cardId: CITY.id,
    lines,
  })),
  { table: "return", kind: "purchase", date: "2026-10-20", reason: "damaged_lost", lines },
  ...moneyType.enumValues.flatMap((type) =>
    (["cash", "card"] as const).map((source) =>
      money({
        type,
        date: "2026-10-20",
        amount: A,
        source,
        customerId: CUST,
        supplierId: SUPP,
        cardId: CITY.id,
        personId: ARIF,
        category: "rent",
        cardCharged: 1_020_100,
        cashReceived: A,
        settleMode: source === "cash" ? "received" : "added_to_due",
        openingKind: "customer_due",
      }),
    ),
  ),
  ...openingKind.enumValues
    .filter((k) => k !== "opening_difference")
    .map((k) =>
      money({
        type: "opening_correction",
        date: "2026-10-20",
        amount: -A,
        openingKind: k,
        customerId: CUST,
        supplierId: SUPP,
        cardId: CITY.id,
        personId: SUMON,
      }),
    ),
];

const key = (e: Effect) => `${e.account}|${e.id ?? ""}|${e.month ?? ""}`;
const sums = (effects: Effect[]) => {
  const out: Record<string, number> = {};
  for (const e of effects) out[key(e)] = add(out[key(e)] ?? 0, e.amount);
  return out;
};
/** One-sided opening rows: the import's opening difference balances them (SRS §5). */
const oneSided = (e: Entry) =>
  (e.table === "money" && e.type === "opening") ||
  (e.table === "purchase" && e.source === "opening");

describe("U-CR-036.1 effectRows: the rows are the entry's own effects", () => {
  it("every posting type: netted sums equal postEntry's; one row per netted effect", () => {
    for (const entry of EVERY) {
      const effects = postEntry(entry, PARTNERS);
      const net = netEffects(effects);
      expect(sums(net)).toEqual(sums(effects));
      const rows = effectRows(effects, ctx);
      const values = rows.slice(0, net.length).map((r) => r.value);
      expect(values).toEqual(net.map((e) => (e.amount === 0 ? "no change" : signed(e.amount))));
      // Anything after the effects is the one "no change" row for an untouched Cash / Profit.
      expect(rows.slice(net.length).every((r) => r.value === "no change")).toBe(true);
      expect(rows.length - net.length).toBeLessThanOrEqual(1);
      if (!oneSided(entry)) expect(imbalance(effects)).toBe(0);
    }
    expectBalanced(EVERY.filter((e) => !oneSided(e)).map((e) => posted(e)));
  });

  it("a sale with Received now shows the customer once, netted; profit last", () => {
    const sale = postEntry(EVERY.find((e) => e.table === "sale") as Entry);
    const paid = postEntry(
      money({ type: "customer_payment", date: "2026-10-20", amount: 2_000_000, customerId: CUST }),
    );
    expect(effectRows([...sale, ...paid], ctx)).toEqual([
      { label: "Stock", value: "-৳20,000" },
      { label: "Test Telecom (Jamal) owes", value: "+৳4,000" },
      { label: "Cash", value: "+৳20,000" },
      { label: "Profit", sub: "Oct 2026", value: "+৳4,000" },
    ]);
  });

  it("a walk-in sale paid in full: the customer nets to no change", () => {
    const rows = effectRows(
      [
        { account: "customer_due", amount: A, id: CUST },
        { account: "customer_due", amount: -A, id: CUST },
        { account: "cash", amount: A },
      ],
      ctx,
    );
    expect(rows).toEqual([
      { label: "Test Telecom (Jamal) owes", value: "no change" },
      { label: "Cash", value: "+৳10,000" },
      { label: "Profit", value: "no change" },
    ]);
  });

  it("a card charge names its bill (statement day, override, EMI); a credit doesn't", () => {
    const row = (e: Entry) => effectRows(postEntry(e), ctx, billOf(e));
    expect(row(purchase("card", { date: "2026-10-27" }))[1]).toEqual({
      label: "Arif · City Amex",
      sub: "Oct 2026 bill",
      value: "+৳10,000",
    });
    expect(row(purchase("card", { date: "2026-10-28" }))[1].sub).toBe("Nov 2026 bill");
    expect(row(purchase("card", { billMonthOverride: "2027-01" }))[1].sub).toBe("Jan 2027 bill");
    expect(row(purchase("card", { date: "2026-10-28", emiMonths: 5 }))[1].sub).toBe(
      "5 bills from Nov 2026",
    );
    const payment = money({ type: "card_payment", date: "2026-10-20", amount: A, cardId: CITY.id });
    expect(effectRows(postEntry(payment), ctx, { date: payment.date })[1]).toEqual({
      label: "Arif · City Amex",
      value: "-৳10,000",
    });
    // Without the cards (a form that has none) there is no sub, never an error.
    expect(effectRows(postEntry(purchase("card")), { names }, { date: "2026-10-20" })[1]).toEqual({
      label: "Arif · City Amex",
      value: "+৳10,000",
    });
  });
});

describe("U-CR-036.1 the Journal: What it did, Delete, Reverse", () => {
  const expense: StoredEntry = {
    ...money({
      type: "expense",
      date: "2026-10-10",
      amount: A,
      source: "card",
      cardId: CITY.id,
      category: "rent",
      forMonth: "2026-10-01",
    }),
    id: "e-1",
    createdAt: "2026-10-10T10:00:00Z",
  };
  const p: Posting = { entry: expense, partners: PARTNERS };

  it("What it did: the saved rows, the charge's bill", () => {
    expect(didRows(p, ctx)).toEqual([
      { label: "Arif · City Amex", sub: "Oct 2026 bill", value: "+৳10,000" },
      { label: "Profit", sub: "Oct 2026", value: "-৳10,000" },
      { label: "Cash", value: "no change" },
    ]);
  });

  it("Delete: the same rows negated; the charge drops out of its bill", () => {
    expect(deleteRows(p, ctx)).toEqual([
      { label: "Arif · City Amex", sub: "drops out of the Oct 2026 bill", value: "-৳10,000" },
      { label: "Profit", sub: "Oct 2026", value: "+৳10,000" },
      { label: "Cash", value: "no change" },
    ]);
  });

  it("Reverse: negated in the reversal's own date and for month (D-058)", () => {
    expect(reversalRows(p, ctx, "2026-11-02", "2026-11")).toEqual([
      { label: "Arif · City Amex", sub: "drops out of the Oct 2026 bill", value: "-৳10,000" },
      { label: "Profit", sub: "Nov 2026", value: "+৳10,000" },
      { label: "Cash", value: "no change" },
    ]);
    // No for month on the original (a card fee): the profit lands in the reversal's date.
    const fee: StoredEntry = { ...expense, type: "card_fee", forMonth: null };
    expect(reversalRows({ ...p, entry: fee }, ctx, "2026-11-02", "2026-10")[1]).toEqual({
      label: "Profit",
      sub: "Nov 2026",
      value: "+৳10,000",
    });
  });

  it("a reversed charge was on its bill; deleting its reversal puts it back", () => {
    expect(didRows({ ...p, reversed: true }, ctx)[0]).toEqual({
      label: "Arif · City Amex",
      sub: "was on the Oct 2026 bill · reversed",
      value: "+৳10,000",
    });
    const reversal: StoredEntry = { ...expense, id: "e-2", date: "2026-11-02", reversesId: "e-1" };
    expect(deleteRows({ entry: reversal, original: expense, partners: PARTNERS }, ctx)[0]).toEqual({
      label: "Arif · City Amex",
      sub: "back on the Oct 2026 bill",
      value: "+৳10,000",
    });
  });

  it("a saved reversal names its original's bill", () => {
    const reversal: StoredEntry = { ...expense, id: "e-2", date: "2026-11-02", reversesId: "e-1" };
    expect(didRows({ entry: reversal, original: expense, partners: PARTNERS }, ctx)[0]).toEqual({
      label: "Arif · City Amex",
      sub: "drops out of the Oct 2026 bill",
      value: "-৳10,000",
    });
  });
});

describe("U-CR-036.2 entryConfirm: the confirms (UIDD §5)", () => {
  const cctx = {
    ...ctx,
    cards: [{ ...CITY, owner: "Arif", ownerPersonId: ARIF }],
    people: [
      { id: ARIF, name: "Arif", kind: "partner" },
      { id: SUMON, name: "Sumon", kind: "partner" },
    ],
    owed: { [ARIF]: 2_500_000 },
    partners: PARTNERS,
  };
  const cashOut = (cashReceived: number) =>
    money({
      type: "card_cash_out",
      date: "2026-10-20",
      amount: 1_020_100,
      cardId: CITY.id,
      cardCharged: 1_020_100,
      cashReceived,
    });

  it("card cash-out: the charge, the cash, the fee and its %", () => {
    expect(entryConfirm(cashOut(A), cctx)).toEqual({
      title: "Cash-out on Arif · City Amex",
      lead: "৳10,201 goes on the card and ৳10,000 comes in as cash. The ৳201 difference is a fee, a business expense.",
      rows: [
        { label: "Cash", value: "+৳10,000" },
        { label: "Arif · City Amex", sub: "Oct 2026 bill", value: "+৳10,201" },
        { label: "Profit", sub: "Oct 2026 · fee 1.97%", value: "-৳201" },
      ],
      notes: [],
    });
  });

  it("card cash-out with no fee", () => {
    const sheet = entryConfirm(cashOut(1_020_100), cctx);
    expect(sheet?.lead).toBe("৳10,201 goes on the card and comes in as cash, with no fee.");
    expect(sheet?.rows.at(-1)).toEqual({ label: "Profit", value: "no change" });
  });

  it("opening correction: what was wrong, each partner's opening difference", () => {
    const fix = (k: MoneyEntry["openingKind"], more: Partial<MoneyEntry> = {}) =>
      entryConfirm(
        money({
          type: "opening_correction",
          date: "2026-10-20",
          amount: 2_000_000,
          openingKind: k,
          ...more,
        }),
        cctx,
      );
    expect(fix("customer_due", { customerId: CUST })).toEqual({
      title: "Correct the opening",
      lead: "Test Telecom (Jamal)'s due at opening was wrong. The fix goes to the partners' opening difference, not this month's profit.",
      rows: [
        { label: "Test Telecom (Jamal) owes", value: "+৳20,000" },
        { label: "Arif's opening difference", value: "+৳10,000" },
        { label: "Sumon's opening difference", value: "+৳10,000" },
        { label: "Cash and profit", value: "no change" },
      ],
      notes: [],
    });
    expect(fix("cash")?.lead).toMatch(/^Cash at opening was wrong\./);
    expect(fix("supplier_due", { supplierId: SUPP })?.lead).toMatch(
      /^What we owed Test Supplier at/,
    );
    expect(fix("card_balance", { cardId: CITY.id })?.lead).toMatch(
      /^Arif · City Amex's balance at/,
    );
    expect(fix("capital", { personId: SUMON })?.lead).toMatch(/^Sumon's capital at/);
    expect(fix("profit_owed", { personId: SUMON })?.lead).toMatch(/^Sumon's profit owed at/);
  });

  it("profit paid / reinvested: only above the profit owed", () => {
    const profit = (type: MoneyEntry["type"], amount: number) =>
      entryConfirm(money({ type, date: "2026-10-20", amount, personId: ARIF }), cctx);
    expect(profit("profit_paid", 3_000_000)).toEqual({
      title: "Pay Arif's profit",
      lead: "Cash paid to Arif out of the profit Arif is owed.",
      rows: [
        { label: "Cash", value: "-৳30,000" },
        { label: "Profit owed to Arif", value: "-৳30,000" },
        { label: "Profit", value: "no change" },
      ],
      notes: ["This is ৳5,000 more than Arif's profit owed (৳25,000)."],
    });
    expect(profit("profit_reinvested", 3_000_000)?.title).toBe("Arif reinvests profit");
    expect(profit("profit_reinvested", 3_000_000)?.lead).toBe(
      "Arif's profit stays in the business as capital.",
    );
    expect(profit("profit_paid", 2_500_000)).toBeNull();
    expect(profit("profit_reinvested", 1_000_000)).toBeNull();
  });

  it("no confirm for a cash capital out, other types, or an incomplete entry", () => {
    const base = { date: "2026-10-20", amount: A, personId: ARIF, cardId: CITY.id };
    expect(entryConfirm(money({ ...base, type: "capital_out", source: "cash" }), cctx)).toBeNull();
    expect(entryConfirm(money({ ...base, type: "expense", source: "card" }), cctx)).toBeNull();
    expect(entryConfirm(money({ ...base, type: "card_payment" }), cctx)).toBeNull();
    expect(entryConfirm(money({ ...base, type: "card_cash_out", cardId: null }), cctx)).toBeNull();
    expect(entryConfirm(purchase("card"), cctx)).toBeNull();
    expect(entryConfirm(null, cctx)).toBeNull();
  });
});
