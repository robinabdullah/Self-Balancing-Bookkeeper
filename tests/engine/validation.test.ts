import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { postEntry } from "@mbl/domain/engine/post";
import { moneyEntrySchema } from "@mbl/domain/validation/money-entry";
import {
  cardBillDateSchema,
  cardSchema,
  customerSchema,
  modelSchema,
  personSchema,
  supplierSchema,
} from "@mbl/domain/validation/setup";
import { purchaseSchema, returnSchema, saleSchema } from "@mbl/domain/validation/trade";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = uuid(1);
const CUSTOMER = uuid(2);
const SUPPLIER = uuid(3);
const CARD = uuid(4);
const PERSON = uuid(5);
const MODEL = uuid(6);
const LOT = uuid(7);

/** The field paths a failed parse reports, e.g. ["cardId"]. */
function errorPaths(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
}

function errorAt(schema: z.ZodType, input: unknown, path: string): string | undefined {
  const result = schema.safeParse(input);
  return result.success
    ? undefined
    : result.error.issues.find((i) => i.path.join(".") === path)?.message;
}

const base = { id: ID, date: "2026-10-07", note: "" };

/** One valid form per money type, and the fields SRS §4 requires for it. */
const MONEY_TYPES: [Record<string, unknown>, string[]][] = [
  [{ type: "customer_payment", customerId: CUSTOMER, amount: "5,000" }, ["customerId", "amount"]],
  [
    { type: "customer_cash_given", customerId: CUSTOMER, amount: "5,000" },
    ["customerId", "amount"],
  ],
  [{ type: "customer_discount", customerId: CUSTOMER, amount: "40" }, ["customerId", "amount"]],
  [
    {
      type: "customer_profit_share",
      customerId: CUSTOMER,
      amount: "12,000",
      forMonth: "2026-09",
      settleMode: "added_to_due",
    },
    ["customerId", "amount", "forMonth", "settleMode"],
  ],
  [
    { type: "supplier_payment", supplierId: SUPPLIER, amount: "50,000", source: "cash" },
    ["supplierId", "amount", "source"],
  ],
  [{ type: "card_payment", cardId: CARD, amount: "33,720" }, ["cardId", "amount"]],
  [
    { type: "card_cash_out", cardId: CARD, cardCharged: "10,200", cashReceived: "10,000" },
    ["cardId", "cardCharged", "cashReceived"],
  ],
  [{ type: "card_fee", cardId: CARD, amount: "750" }, ["cardId", "amount"]],
  [{ type: "cashback", amount: "300", source: "cash" }, ["amount", "source"]],
  [
    { type: "expense", amount: "15,000", category: "salary", source: "cash" },
    ["amount", "category", "source"],
  ],
  [{ type: "capital_in", personId: PERSON, amount: "1,00,000" }, ["personId", "amount"]],
  [{ type: "capital_out", personId: PERSON, amount: "20,000" }, ["personId", "amount"]],
  [{ type: "profit_paid", personId: PERSON, amount: "20,000" }, ["personId", "amount"]],
  [{ type: "profit_reinvested", personId: PERSON, amount: "20,000" }, ["personId", "amount"]],
  [
    {
      type: "opening_correction",
      openingKind: "customer_due",
      customerId: CUSTOMER,
      amount: "-500",
    },
    ["openingKind", "customerId", "amount"],
  ],
];

describe("U2.10.1 money entry schema: each type's required fields", () => {
  it.each(MONEY_TYPES)("%o accepts its required fields", (fields) => {
    expect(errorPaths(moneyEntrySchema, { ...base, ...fields })).toEqual([]);
  });

  it.each(MONEY_TYPES)("%o rejects each missing required field", (fields, required) => {
    for (const field of required) {
      const input: Record<string, unknown> = { ...base, ...fields };
      delete input[field];
      expect(errorPaths(moneyEntrySchema, input), field).toContain(field);
      expect(errorPaths(moneyEntrySchema, { ...input, [field]: "" }), field).toContain(field);
    }
  });

  it("rejects a missing date or id, and an unknown type", () => {
    const payment = { ...base, type: "card_payment", cardId: CARD, amount: "100" };
    expect(errorPaths(moneyEntrySchema, { ...payment, date: "" })).toEqual(["date"]);
    expect(errorPaths(moneyEntrySchema, { ...payment, id: undefined })).toEqual(["id"]);
    expect(errorPaths(moneyEntrySchema, { ...payment, type: "opening" })).toEqual(["type"]);
  });

  it("rejects a card-source expense without card_id; keeps the card only for a card", () => {
    const expense = { ...base, type: "expense", amount: "750", category: "delivery" };
    expect(errorAt(moneyEntrySchema, { ...expense, source: "card" }, "cardId")).toBe("Pick a card");
    expect(moneyEntrySchema.parse({ ...expense, source: "card", cardId: CARD })).toMatchObject({
      source: "card",
      cardId: CARD,
    });
    expect(moneyEntrySchema.parse({ ...expense, source: "cash", cardId: CARD })).toMatchObject({
      source: "cash",
      cardId: null,
    });
    expect(
      errorAt(moneyEntrySchema, { ...expense, source: "cash", category: "food" }, "category"),
    ).toBe("Pick a category");
  });

  it("card-source supplier payment and cashback need the card", () => {
    const pay = { ...base, type: "supplier_payment", supplierId: SUPPLIER, amount: "100" };
    expect(errorPaths(moneyEntrySchema, { ...pay, source: "card" })).toEqual(["cardId"]);
    const back = { ...base, type: "cashback", amount: "100", source: "card" };
    expect(errorPaths(moneyEntrySchema, back)).toEqual(["cardId"]);
  });

  it("rejects cash_received > card_charged; amount = card_charged", () => {
    const cashOut = { ...base, type: "card_cash_out", cardId: CARD, cardCharged: "10,200" };
    expect(errorAt(moneyEntrySchema, { ...cashOut, cashReceived: "10,201" }, "cashReceived")).toBe(
      "Cash received can't exceed amount charged",
    );
    expect(moneyEntrySchema.parse({ ...cashOut, cashReceived: "10,200" })).toMatchObject({
      amount: 1_020_000,
      cardCharged: 1_020_000,
      cashReceived: 1_020_000,
    });
  });

  it("money is integer poisha: no float, no rounding, > 0 except an opening correction", () => {
    const payment = { ...base, type: "customer_payment", customerId: CUSTOMER };
    expect(moneyEntrySchema.parse({ ...payment, amount: "17,444.80" })).toMatchObject({
      amount: 1_744_480,
    });
    for (const bad of ["0", "-5", "1.005", "abc", "1e3"])
      expect(errorPaths(moneyEntrySchema, { ...payment, amount: bad }), bad).toEqual(["amount"]);
    expect(errorPaths(moneyEntrySchema, { ...payment, amount: 5000 })).toEqual(["amount"]);

    const fix = { ...base, type: "opening_correction", openingKind: "cash" };
    expect(moneyEntrySchema.parse({ ...fix, amount: "-1,000" })).toMatchObject({
      amount: -100_000,
    });
    expect(errorAt(moneyEntrySchema, { ...fix, amount: "0" }, "amount")).toBe("Amount can't be 0");
  });

  it("drops fields the type doesn't allow", () => {
    const parsed = moneyEntrySchema.parse({
      ...base,
      type: "card_payment",
      cardId: CARD,
      amount: "100",
      customerId: CUSTOMER,
      emiMonths: "3",
      reversesId: uuid(9),
    });
    expect(parsed).toEqual({ ...base, type: "card_payment", cardId: CARD, amount: 10_000 });
  });

  it("expense for_month defaults to the date's month; card fee gets its category", () => {
    const expense = { ...base, type: "expense", amount: "1", category: "rent", source: "cash" };
    expect(moneyEntrySchema.parse(expense)).toMatchObject({ forMonth: "2026-10" });
    expect(moneyEntrySchema.parse({ ...expense, forMonth: "2026-09" })).toMatchObject({
      forMonth: "2026-09",
    });
    expect(errorPaths(moneyEntrySchema, { ...expense, forMonth: "2026-13" })).toEqual(["forMonth"]);
    const fee = { ...base, type: "card_fee", cardId: CARD, amount: "750" };
    expect(moneyEntrySchema.parse(fee)).toMatchObject({ category: "card fee/interest" });
  });

  it("an opening correction needs its kind's target, keeps only that one, never D itself", () => {
    const fix = { ...base, type: "opening_correction", amount: "2,000" };
    expect(
      errorAt(
        moneyEntrySchema,
        { ...fix, openingKind: "card_balance", personId: PERSON },
        "cardId",
      ),
    ).toBe("Pick a card");
    expect(
      moneyEntrySchema.parse({
        ...fix,
        openingKind: "capital",
        personId: PERSON,
        cardId: CARD,
      }),
    ).toMatchObject({ personId: PERSON, cardId: null, customerId: null, supplierId: null });
    expect(
      errorPaths(moneyEntrySchema, { ...fix, openingKind: "opening_difference", personId: PERSON }),
    ).toEqual(["openingKind"]);
  });

  it("the output posts through postEntry (the form preview's input)", () => {
    const parsed = moneyEntrySchema.parse({
      ...base,
      type: "card_payment",
      cardId: CARD,
      amount: "33,720",
    });
    expect(postEntry({ ...parsed, table: "money" })).toEqual([
      { account: "cash", amount: -3_372_000 },
      { account: "card", amount: -3_372_000, id: CARD },
    ]);
  });
});

describe("U2.10.1 purchase, sale and return schemas", () => {
  const line = { id: uuid(10), modelId: MODEL, qty: "3", unitCost: "16,860" };
  const purchase = { ...base, source: "cash", lines: [line] };

  it("purchase: each source needs its own picker; lines are required", () => {
    expect(purchaseSchema.parse(purchase).lines[0]).toEqual({
      ...line,
      qty: 3,
      unitCost: 1_686_000,
      imeiNote: null,
    });
    expect(errorPaths(purchaseSchema, { ...purchase, source: "card" })).toEqual(["cardId"]);
    expect(errorPaths(purchaseSchema, { ...purchase, source: "supplier_credit" })).toEqual([
      "supplierId",
    ]);
    expect(errorPaths(purchaseSchema, { ...purchase, source: "customer_offset" })).toEqual([
      "customerId",
    ]);
    expect(errorPaths(purchaseSchema, { ...purchase, source: "opening" })).toEqual(["source"]);
    expect(errorPaths(purchaseSchema, { ...purchase, lines: [] })).toEqual(["lines"]);
    expect(errorPaths(purchaseSchema, { ...purchase, lines: [{ ...line, qty: "0" }] })).toEqual([
      "lines.0.qty",
    ]);
    expect(errorPaths(purchaseSchema, { ...purchase, lines: [{ ...line, qty: "1.5" }] })).toEqual([
      "lines.0.qty",
    ]);
  });

  it("purchase: EMI ≥ 2 and card only; a cash purchase keeps no card", () => {
    const card = { ...purchase, source: "card", cardId: CARD };
    expect(
      purchaseSchema.parse({ ...card, emiMonths: "6", billMonthOverride: "2026-11" }),
    ).toMatchObject({ emiMonths: 6, billMonthOverride: "2026-11" });
    expect(errorPaths(purchaseSchema, { ...card, emiMonths: "1" })).toEqual(["emiMonths"]);
    expect(errorPaths(purchaseSchema, { ...purchase, emiMonths: "3" })).toEqual(["emiMonths"]);
    expect(purchaseSchema.parse({ ...purchase, cardId: CARD, emiMonths: "" })).toMatchObject({
      cardId: null,
      emiMonths: null,
    });
  });

  it("sale: customer and lines required; a zero price is allowed; lot optional", () => {
    const sale = {
      ...base,
      customerId: CUSTOMER,
      lines: [{ modelId: MODEL, qty: "2", unitPrice: "0" }],
    };
    expect(saleSchema.parse(sale)).toMatchObject({
      lines: [{ modelId: MODEL, qty: 2, unitPrice: 0, lotId: null }],
      receivedNow: null,
    });
    expect(saleSchema.parse({ ...sale, receivedNow: "5,000", paymentId: uuid(12) })).toMatchObject({
      receivedNow: 500_000,
      paymentId: uuid(12),
    });
    // Received now needs the payment's id (D-006); without it the id is dropped.
    expect(errorPaths(saleSchema, { ...sale, receivedNow: "5,000" })).toEqual(["receivedNow"]);
    expect(saleSchema.parse({ ...sale, paymentId: uuid(12) })).toMatchObject({ paymentId: null });
    expect(errorPaths(saleSchema, { ...sale, customerId: "" })).toEqual(["customerId"]);
    expect(errorPaths(saleSchema, { ...sale, lines: [{ modelId: MODEL, qty: "2" }] })).toEqual([
      "lines.0.unitPrice",
    ]);
  });

  it("customer return: customer, bill line, qty and refund per unit", () => {
    const ret = {
      ...base,
      kind: "customer",
      customerId: CUSTOMER,
      lines: [{ saleLineId: uuid(11), qty: "1", unitAmount: "17,010" }],
    };
    expect(errorPaths(returnSchema, ret)).toEqual([]);
    expect(errorPaths(returnSchema, { ...ret, lines: [{ qty: "1", unitAmount: "1" }] })).toEqual([
      "lines.0.saleLineId",
    ]);
  });

  it("purchase return: refund target per refund_to; damaged/lost refunds 0", () => {
    const ret = {
      ...base,
      kind: "purchase",
      reason: "returned",
      lines: [{ lotId: LOT, qty: "1", unitAmount: "16,860" }],
    };
    expect(errorPaths(returnSchema, ret)).toEqual(["refundTo"]);
    expect(errorPaths(returnSchema, { ...ret, refundTo: "supplier" })).toEqual(["supplierId"]);
    expect(errorPaths(returnSchema, { ...ret, refundTo: "card" })).toEqual(["cardId"]);
    expect(
      returnSchema.parse({ ...ret, refundTo: "cash", cardId: CARD, supplierId: SUPPLIER }),
    ).toMatchObject({ refundTo: "cash", cardId: null, supplierId: null, customerId: null });
    expect(returnSchema.parse({ ...ret, reason: "damaged_lost", refundTo: "card" })).toMatchObject({
      refundTo: null,
      cardId: null,
      lines: [{ lotId: LOT, qty: 1, unitAmount: 0 }],
    });
  });
});

describe("U2.10.1 setup schemas", () => {
  it("person: a partner needs a profit share %, an investor keeps none", () => {
    const person = { id: ID, name: " Arif ", kind: "partner" };
    expect(errorPaths(personSchema, person)).toEqual(["profitSharePct"]);
    expect(personSchema.parse({ ...person, profitSharePct: "33.333" })).toMatchObject({
      name: "Arif",
      profitSharePct: 33.333,
      note: null,
    });
    expect(errorPaths(personSchema, { ...person, profitSharePct: "33.3333" })).toEqual([
      "profitSharePct",
    ]);
    expect(errorPaths(personSchema, { ...person, profitSharePct: "101" })).toEqual([
      "profitSharePct",
    ]);
    expect(personSchema.parse({ ...person, kind: "investor", profitSharePct: "50" })).toMatchObject(
      {
        profitSharePct: null,
      },
    );
    expect(errorPaths(personSchema, { ...person, name: "  ", profitSharePct: "50" })).toEqual([
      "name",
    ]);
  });

  it("card: owner, statement/due day 1–31, optional limit", () => {
    const card = {
      id: ID,
      name: "City Visa",
      ownerPersonId: PERSON,
      statementDay: "28",
      dueDay: "12",
    };
    expect(cardSchema.parse(card)).toMatchObject({
      statementDay: 28,
      dueDay: 12,
      creditLimit: null,
    });
    expect(errorPaths(cardSchema, { ...card, statementDay: "32", ownerPersonId: "" })).toEqual([
      "ownerPersonId",
      "statementDay",
    ]);
  });

  it("customer: only the proprietor name is required", () => {
    const customer = { id: ID, proprietorName: "Milon", shopName: "", email: "" };
    expect(customerSchema.parse(customer)).toMatchObject({
      shopName: null,
      email: null,
      targetBalance: null,
    });
    expect(errorPaths(customerSchema, { ...customer, email: "milon@" })).toEqual(["email"]);
    expect(errorPaths(customerSchema, { id: ID })).toEqual(["proprietorName"]);
  });

  it("supplier and model need a name; a bill-date override needs a date", () => {
    expect(errorPaths(supplierSchema, { id: ID, name: "" })).toEqual(["name"]);
    expect(errorPaths(modelSchema, { id: ID, name: "Vivo Y05 4/64" })).toEqual([]);
    const bill = { id: ID, cardId: CARD, billMonth: "2026-10" };
    expect(errorPaths(cardBillDateSchema, bill)).toEqual(["actualStatementDate"]);
    expect(errorPaths(cardBillDateSchema, { ...bill, actualDueDate: "2026-11-13" })).toEqual([]);
  });
});
