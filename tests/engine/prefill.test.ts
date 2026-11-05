import { describe, expect, it } from "vitest";
import { TYPES } from "@mbl/domain/money/types";
import { quickActions } from "@/components/shell/nav";
import { cleanPrefill, cleanReturnPrefill, returnLink } from "@mbl/domain/prefill";
import type { SetupData } from "../../apps/api/src/setup/setup-data.service";

// U-CR-013.7 / U-CR-013.8 (D-032): forms opened from a page. Synthetic ids.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [CUST, WALK_IN, OLD_CUST, SUPP, CARD, OLD_CARD, PERSON] = [1, 2, 3, 4, 5, 6, 7].map(id);
const setup = {
  customers: [
    { id: CUST, active: true, isSystem: false },
    { id: WALK_IN, active: true, isSystem: true },
    { id: OLD_CUST, active: false, isSystem: false },
  ],
  suppliers: [{ id: SUPP, active: true }],
  cards: [
    { id: CARD, active: true },
    { id: OLD_CARD, active: false },
  ],
  people: [{ id: PERSON, active: true }],
} as unknown as SetupData;

describe("U-CR-013.7 cleanPrefill", () => {
  it("keeps what the form can use", () => {
    expect(
      cleanPrefill("card_payment", { cardId: CARD, amount: "35206.00", from: "/cards/x" }, setup),
    ).toEqual({ prefill: { cardId: CARD, amount: "35,206" }, from: "/cards/x" });
    expect(cleanPrefill("customer_payment", { customerId: CUST }, setup).prefill).toEqual({
      customerId: CUST,
    });
    expect(cleanPrefill("capital_in", { personId: PERSON }, setup).prefill).toEqual({
      personId: PERSON,
    });
    expect(cleanPrefill("sale", { customerId: CUST }, setup).prefill).toEqual({
      customerId: CUST,
    });
  });

  it("drops bad, unknown and inactive ids", () => {
    for (const cardId of ["nope", id(99), OLD_CARD, ""]) {
      expect(cleanPrefill("card_payment", { cardId }, setup).prefill, cardId).toEqual({});
    }
    expect(cleanPrefill("customer_payment", { customerId: OLD_CUST }, setup).prefill).toEqual({});
    expect(cleanPrefill("card_payment", { cardId: [CARD, CARD] }, setup).prefill).toEqual({});
  });

  it("Walk-in can't be given cash or a profit share (D-009), but can buy", () => {
    expect(cleanPrefill("customer_cash_given", { customerId: WALK_IN }, setup).prefill).toEqual({});
    expect(cleanPrefill("customer_profit_share", { customerId: WALK_IN }, setup).prefill).toEqual(
      {},
    );
    expect(cleanPrefill("sale", { customerId: WALK_IN }, setup).prefill).toEqual({
      customerId: WALK_IN,
    });
  });

  it("an amount must be more than 0; Indian grouping parses", () => {
    for (const amount of ["0", "-5", "abc", "1.234", ""]) {
      expect(cleanPrefill("card_payment", { amount }, setup).prefill, amount).toEqual({});
    }
    expect(cleanPrefill("card_payment", { amount: "1,00,000.50" }, setup).prefill).toEqual({
      amount: "1,00,000.50",
    });
  });

  it("a card means paid by Card where the form has a Cash · Card choice", () => {
    expect(cleanPrefill("expense", { cardId: CARD }, setup).prefill).toEqual({
      cardId: CARD,
      source: "card",
    });
    expect(cleanPrefill("purchase", { cardId: CARD, supplierId: SUPP }, setup).prefill).toEqual({
      cardId: CARD,
      supplierId: SUPP,
      source: "card",
    });
    expect(cleanPrefill("card_fee", { cardId: CARD }, setup).prefill).toEqual({ cardId: CARD });
  });

  it("ignores ids the form has no field for, and an unknown form", () => {
    expect(cleanPrefill("card_payment", { customerId: CUST }, setup).prefill).toEqual({});
    expect(cleanPrefill("capital_in", { cardId: CARD }, setup).prefill).toEqual({});
    expect(cleanPrefill(null, { cardId: CARD, amount: "5" }, setup).prefill).toEqual({});
  });

  it("from must be a path in this app", () => {
    expect(cleanPrefill("card_payment", { from: "//evil.com" }, setup).from).toBeUndefined();
    expect(cleanPrefill("card_payment", { from: "https://x" }, setup).from).toBeUndefined();
  });
});
describe("U-CR-013.8 / U-CR-018.1 quick actions", () => {
  const params = (href: string) => new URL(href, "http://x").searchParams;
  type Groups = ReturnType<typeof quickActions>;
  const labels = (list: { label: string }[]) => list.map((a) => a.label);
  /** Main buttons, then ⋯ New entry · Reports & share · Manage, as labels. */
  const shape = (g: Groups) => [
    labels(g.primary),
    labels(g.more.newEntry),
    labels(g.more.reports),
    labels(g.more.manage),
  ];
  const all = (g: Groups) => [g.primary, g.more.newEntry, g.more.reports, g.more.manage].flat();

  it("U-CR-018.1 two main buttons per kind; the rest in ⋯ More by group", () => {
    expect(shape(quickActions("card", { id: CARD, active: true }, "/cards/c"))).toEqual([
      ["Pay card", "Cash-out"],
      ["Card fee", "Purchase", "Personal spend"], // D-060
      ["Statement", "See in Journal"],
      ["Edit", "Card details"],
    ]);
    expect(shape(quickActions("customer", { id: CUST, active: true }, "/c"))).toEqual([
      ["Payment in", "Sale"],
      ["Profit share", "Discount"],
      ["Statement", "Due trend", "See in Journal"], // CR-043
      ["Edit", "Bank accounts"],
    ]);
    expect(shape(quickActions("supplier", { id: SUPP, active: true }, "/s"))).toEqual([
      ["Supplier payment", "Purchase"],
      [],
      ["Statement", "See in Journal"],
      ["Edit", "Bank accounts"],
    ]);
    expect(shape(quickActions("person", { id: PERSON, active: true }, "/p"))).toEqual([
      ["Capital in / out", "Profit paid / reinvested"],
      [],
      ["Investor report", "Statement", "See in Journal"],
      ["Edit", "Bank accounts"],
    ]);
  });

  it("U-CR-025.5 a person's ⋯ Investor report opens the report page with them picked", () => {
    const [report] = quickActions("person", { id: PERSON, active: false }, "/p").more.reports;
    expect(report).toEqual({
      label: "Investor report",
      href: `/reports/investor?person=${PERSON}`,
    });
  });

  it("each form link carries the row and the way back; Journal filters by it", () => {
    const [pay, , , purchase, , statement, journal, edit] = all(
      quickActions("card", { id: CARD, active: true }, "/cards/c?entry=e"),
    );
    expect(pay.href.startsWith("/money/new?")).toBe(true);
    expect(Object.fromEntries(params(pay.href))).toEqual({
      type: "card_payment",
      cardId: CARD,
      from: "/cards/c?entry=e",
    });
    expect(Object.fromEntries(params(purchase.href))).toEqual({
      cardId: CARD,
      from: "/cards/c?entry=e",
    });
    expect(journal.href).toBe(`/journal?who=${CARD}`);
    expect(statement.href).toBe("/cards/c?entry=e&report=1");
    expect(Object.fromEntries(params(edit.href))).toEqual({
      tab: "card",
      edit: CARD,
      from: "/cards/c?entry=e",
    });
  });

  it("U-CR-018.1 an inactive row has only ⋯ (Journal, Edit); Walk-in Sale + ⋯ Journal", () => {
    expect(shape(quickActions("card", { id: OLD_CARD, active: false }, "/c"))).toEqual([
      [],
      [],
      ["Statement", "See in Journal"],
      ["Edit", "Card details"],
    ]);
    expect(
      shape(quickActions("customer", { id: WALK_IN, active: true, isSystem: true }, "/c")),
    ).toEqual([["Sale"], [], ["See in Journal"], []]);
  });

  it("every money type linked exists, and cleanPrefill keeps its row", () => {
    const known = new Set(TYPES.map(([t]) => t as string));
    for (const [kind, row] of [
      ["card", CARD],
      ["customer", CUST],
      ["supplier", SUPP],
      ["person", PERSON],
    ] as const) {
      for (const a of all(quickActions(kind, { id: row, active: true }, "/x"))) {
        const p = params(a.href);
        const type = p.get("type");
        if (!a.href.startsWith("/money/new")) continue;
        expect(known.has(type!), `${kind}: ${type}`).toBe(true);
        const kept = cleanPrefill(type, Object.fromEntries(p), setup).prefill;
        expect(kept[`${kind}Id`], `${kind}: ${type}`).toBe(row);
      }
    }
  });
});

describe("U-CR-020.5 ⋯ Reports & share: Statement and Remind on WhatsApp (D-040)", () => {
  const reports = (...args: Parameters<typeof quickActions>) =>
    quickActions(...args).more.reports.map((l) => [l.label, l.href]);
  it("a customer who owes can be reminded; the links open over the same page", () => {
    expect(reports("customer", { id: CUST, active: true }, "/customers/c?tab=bills", true)).toEqual(
      [
        ["Statement", "/customers/c?tab=bills&report=1"],
        ["Remind on WhatsApp", "/customers/c?tab=bills&send=reminder"],
        ["Due trend", `/customers/${CUST}/trend`], // CR-043
        ["See in Journal", `/journal?who=${CUST}`],
      ],
    );
    expect(reports("customer", { id: CUST, active: false }, "/c", true).map(([l]) => l)).toContain(
      "Remind on WhatsApp",
    );
  });
  it("no reminder without a due, nor for others; Walk-in has neither (nor a Due trend, E-CR-043.1)", () => {
    expect(reports("customer", { id: CUST, active: true }, "/c", false).map(([l]) => l)).toEqual([
      "Statement",
      "Due trend",
      "See in Journal",
    ]);
    expect(reports("supplier", { id: SUPP, active: true }, "/s", true).map(([l]) => l)).toEqual([
      "Statement",
      "See in Journal",
    ]);
    expect(
      reports("customer", { id: WALK_IN, active: true, isSystem: true }, "/c", true).map(
        ([l]) => l,
      ),
    ).toEqual(["See in Journal"]);
  });
});

describe("U-CR-019.3 ⋯ Manage → Bank accounts (D-039)", () => {
  const manage = (...args: Parameters<typeof quickActions>) => quickActions(...args).more.manage;
  it("people, customers and suppliers open their saved accounts over the same page", () => {
    for (const kind of ["person", "customer", "supplier"] as const) {
      const bank = manage(kind, { id: CUST, active: true }, "/customers/c?tab=bills").at(-1)!;
      expect(bank).toEqual({ label: "Bank accounts", href: "/customers/c?tab=bills&bank=1" });
    }
    // An inactive row keeps it.
    expect(manage("supplier", { id: SUPP, active: false }, "/s").map((l) => l.label)).toEqual([
      "Edit",
      "Bank accounts",
    ]);
  });

  it("not on cards (U-CR-026: their Card details instead) or the built-in Walk-in", () => {
    expect(manage("card", { id: CARD, active: true }, "/cards/c?from=x")).toEqual([
      expect.objectContaining({ label: "Edit" }),
      { label: "Card details", href: "/cards/c?from=x&secret=1" },
    ]);
    expect(manage("customer", { id: WALK_IN, active: true, isSystem: true }, "/c")).toEqual([]);
  });
});

describe("U-CR-051.1 cleanReturnPrefill (D-074)", () => {
  const [PURCHASE, OTHER_PURCHASE, OPENING, LOT_A, LOT_B, LOT_C, LOT_OPEN] = [
    20, 21, 22, 23, 24, 25, 26,
  ].map(id);
  const [SALE, USED_SALE, OLD_SALE, LINE_A, LINE_B, LINE_USED, LINE_OLD] = [
    30, 31, 32, 33, 34, 35, 36,
  ].map(id);
  const lot = (id: string, purchaseId: string, createdAt: string, source = "cash") => ({
    id,
    purchaseId,
    source: source as "cash",
    remaining: 2,
    createdAt,
  });
  const options = {
    // Newer line first in the list: the first lot is the purchase's first line, by createdAt.
    lots: [
      lot(LOT_B, PURCHASE, "2026-10-01T10:00:01Z"),
      lot(LOT_A, PURCHASE, "2026-10-01T10:00:00Z"),
      lot(LOT_C, OTHER_PURCHASE, "2026-10-01T09:00:00Z"),
      lot(LOT_OPEN, OPENING, "2026-09-01T00:00:00Z", "opening"),
    ],
    lines: [
      { id: LINE_USED, saleId: SALE, customerId: CUST, left: 0 },
      { id: LINE_A, saleId: SALE, customerId: CUST, left: 1 },
      { id: LINE_B, saleId: SALE, customerId: CUST, left: 2 },
      { id: LINE_USED, saleId: USED_SALE, customerId: CUST, left: 0 },
      { id: LINE_OLD, saleId: OLD_SALE, customerId: OLD_CUST, left: 1 },
    ],
  };
  const initial = (params: Record<string, string | string[] | undefined>) =>
    cleanReturnPrefill(params, options, setup).initial;

  it("a purchase → Purchase return, Returned to seller, its first lot with stock", () => {
    expect(
      cleanReturnPrefill(
        { kind: "purchase", purchaseId: PURCHASE, from: "/journal?entry=x" },
        options,
        setup,
      ),
    ).toEqual({
      initial: { kind: "purchase", reason: "returned", "lines.0.lotId": LOT_A },
      from: "/journal?entry=x",
    });
  });

  it("a sale → Customer return, its customer and bill, its first line with something left", () => {
    expect(initial({ kind: "customer", saleId: SALE })).toEqual({
      kind: "customer",
      customerId: CUST,
      saleId: SALE,
      "lines.0.saleLineId": LINE_A,
    });
  });

  it("drops a missing kind, an unknown, foreign or used-up id, opening stock, an inactive customer", () => {
    for (const params of [
      { purchaseId: PURCHASE }, // no kind
      { saleId: SALE },
      { kind: "customer", purchaseId: PURCHASE }, // the wrong kind for the id
      { kind: "purchase", saleId: SALE },
      { kind: "purchase", purchaseId: id(99) }, // unknown
      { kind: "customer", saleId: id(99) },
      { kind: "purchase", purchaseId: "nope" },
      { kind: "customer", saleId: [SALE, SALE] },
      { kind: "customer", saleId: USED_SALE }, // nothing left to return
      { kind: "purchase", purchaseId: OPENING }, // opening stock (the user's pick)
      { kind: "customer", saleId: OLD_SALE }, // an inactive customer
    ]) {
      expect(initial(params), JSON.stringify(params)).toEqual({});
    }
  });

  it("returnLink: the entry sheet's link only when the form can start set to it", () => {
    const from = "/journal?entry=" + PURCHASE;
    const link = (table: string, rowId: string) =>
      returnLink({ table, id: rowId }, options, setup, from);
    const params = (href: string | null) =>
      Object.fromEntries(new URL(href!, "http://x").searchParams);
    expect(params(link("purchase", PURCHASE))).toEqual({
      kind: "purchase",
      purchaseId: PURCHASE,
      from,
    });
    expect(params(link("sale", SALE))).toEqual({ kind: "customer", saleId: SALE, from });
    expect(link("purchase", OPENING)).toBeNull();
    expect(link("sale", USED_SALE)).toBeNull();
    expect(link("sale", OLD_SALE)).toBeNull();
    expect(link("return", SALE)).toBeNull();
    expect(link("money", PURCHASE)).toBeNull();
  });
});
