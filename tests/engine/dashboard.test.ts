import { describe, expect, it } from "vitest";
import { breakdown, cardAlerts, cardDues, positionSections, topDues } from "@mbl/domain/dashboard";
import { daysBetween } from "@mbl/domain/dates";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { nextToClose } from "@mbl/domain/engine/months";
import type { Entry } from "@mbl/domain/engine/post";
import { add } from "@mbl/domain/money";
import { PARTNERS } from "./invariant";

// Task 4.1 (UIDD §3, §4.2): the Home lists and the balance chip's breakdown. Synthetic ids (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const [A, B, C] = ["cust-a", "cust-b", "cust-c"];
const [CARD1, CARD2] = ["card-1", "card-2"];
const TODAY = "2026-10-20";

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};
const sale = (date: string, customerId: string, price: number) =>
  stored({
    table: "sale",
    date,
    customerId,
    lines: [{ qty: 1, unitPrice: price, unitCost: 1_000 }],
  });
const cardBuy = (date: string, cardId: string, cost: number) =>
  stored({ table: "purchase", date, source: "card", cardId, lines: [{ qty: 1, unitCost: cost }] });

const entries = [
  stored({
    table: "money",
    type: "capital_in",
    date: "2026-08-01",
    amount: 900_000,
    personId: ARIF,
  }),
  stored({
    table: "purchase",
    date: "2026-08-02",
    source: "cash",
    lines: [{ qty: 5, unitCost: 1_000 }],
  }),
  cardBuy("2026-08-03", CARD1, 10_000), // Aug bill: stmt 5 Aug, due 20 Aug → overdue
  cardBuy("2026-10-01", CARD1, 20_000), // Oct bill: due 20 Oct → today
  cardBuy("2026-10-10", CARD2, 30_000), // card 2 Oct bill: stmt 15 Oct, due 25 Oct
  sale("2026-10-02", A, 5_000),
  sale("2026-10-03", B, 9_000),
  sale("2026-10-04", C, 2_000),
  stored({
    table: "money",
    type: "customer_payment",
    date: "2026-10-05",
    amount: 4_000,
    customerId: C,
  }),
];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [
    { id: CARD1, statementDay: 5, dueDay: 20 },
    { id: CARD2, statementDay: 15, dueDay: 25 },
  ],
  billDates: [],
};
const books = computeBooks(data, TODAY);
const sum = (lines: { amount: number }[]) => lines.map((l) => l.amount).reduce(add, 0);

describe("Home lists and the balance chip (task 4.1)", () => {
  it("4.1.3 card alerts: one row per card (D-032), overdue first, with days left", () => {
    expect(cardAlerts(books.cards, TODAY)).toEqual([
      { cardId: CARD1, dueDate: "2026-08-20", amount: 10_000, daysLeft: -61 },
      { cardId: CARD2, dueDate: "2026-10-25", amount: 30_000, daysLeft: 5 },
    ]);
    expect(cardAlerts(books.cards, TODAY, 1)).toHaveLength(1);
    expect(cardDues(books.cards)).toEqual({ overdue: 10_000, week: 50_000 });
  });

  it("4.1.3 top customer dues: owing only, largest first, with above target", () => {
    expect(topDues(books.customers, { [B]: 6_000 })).toEqual([
      { customerId: B, balance: 9_000, aboveTarget: 3_000 },
      { customerId: A, balance: 5_000, aboveTarget: null },
    ]); // C has a credit of ৳20 → left out
  });

  it("4.1.4 U-CR-039.1 what we have + what we owe = net worth = the invariant's net assets", () => {
    const b = breakdown(books);
    expect(b.haveLines.map((l) => l.label)).toEqual(["Cash", "Stock at cost", "Customers owe"]);
    expect(b.oweLines.map((l) => l.label)).toEqual(["Card balances", "We owe suppliers"]);
    expect(sum(b.haveLines)).toBe(b.businessAssets);
    expect(sum(b.oweLines)).toBe(b.oweTotal);
    expect(add(b.businessAssets, b.oweTotal)).toBe(b.netAssets);
    expect(b.netAssets).toBe(books.invariant.netAssets);
    expect(sum(b.equityLines)).toBe(b.equity);
    // cash 899,000 + stock 62,000 + dues 12,000 = 973,000; cards −60,000 → 913,000 (poisha)
    expect(b.businessAssets).toBe(973_000);
    expect(b.oweLines[0].amount).toBe(-60_000);
    expect(b.oweTotal).toBe(-60_000);
    expect(b.netAssets).toBe(913_000);
    expect(b.difference).toBe(0);
  });

  it("U-CR-039.1 a supplier advance (negative dues) still adds up", () => {
    const advance = computeBooks(
      {
        ...data,
        entries: [
          ...entries,
          stored({
            table: "money",
            type: "supplier_payment",
            date: "2026-10-06",
            amount: 7_000,
            supplierId: "supp-1",
            source: "cash",
          }),
        ],
      },
      TODAY,
    );
    const b = breakdown(advance);
    const suppliers = b.oweLines.find((l) => l.label === "We owe suppliers")!;
    expect(suppliers.amount).toBe(7_000); // paid ahead: the line counts for us
    expect(sum(b.haveLines)).toBe(b.businessAssets);
    expect(add(b.businessAssets, b.oweTotal)).toBe(b.netAssets);
    expect(b.netAssets).toBe(advance.invariant.netAssets);
    expect(b.difference).toBe(0);
  });

  it("U-CR-039.1 positionSections: the sheet's three sections, in order, with their totals", () => {
    const b = breakdown(books);
    expect(
      positionSections(b).map((s) => [s.title, s.totals.map((t) => [t.label, t.amount])]),
    ).toEqual([
      ["What we have", [["Business assets", b.businessAssets]]],
      [
        "What we owe",
        [
          ["Total we owe", b.oweTotal],
          ["Net worth", b.netAssets],
        ],
      ],
      ["Whose it is", [["Total", b.equity]]],
    ]);
  });

  it("4.1.4 next month to close: after the last closed; else the first month with entries", () => {
    expect(nextToClose([], null, TODAY)).toBe("2026-10");
    expect(nextToClose([], "2026-08-01", TODAY)).toBe("2026-08");
    expect(nextToClose(["2026-08-01", "2026-09-01"], "2026-08-01", TODAY)).toBe("2026-10");
    expect(nextToClose(["2026-12"], "2026-08-01", TODAY)).toBe("2027-01");
  });

  it("daysBetween counts calendar days across months and years", () => {
    expect(daysBetween("2026-10-07", "2026-10-14")).toBe(7);
    expect(daysBetween("2026-10-14", "2026-10-07")).toBe(-7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

// U-CR-013.5 (D-032): one alert per card, for its earliest unpaid bill.
describe("U-CR-013.5 card alerts, one per card", () => {
  const bill = (dueDate: string, remaining: number) => ({ dueDate, remaining });
  const cards = (bills: Record<string, { dueDate: string; remaining: number }[]>) =>
    Object.fromEntries(
      Object.entries(bills).map(([id, list]) => [id, { bills: list }]),
    ) as unknown as Parameters<typeof cardAlerts>[0];

  it("an EMI card with several future bills shows once, for its earliest unpaid bill", () => {
    const emi = cards({
      emi: [
        bill("2026-10-20", 0), // paid
        bill("2026-11-20", 2_500),
        bill("2026-12-20", 2_500),
        bill("2027-01-20", 2_500),
        bill("2027-02-20", 2_500),
      ],
    });
    expect(cardAlerts(emi, TODAY)).toEqual([
      { cardId: "emi", dueDate: "2026-11-20", amount: 2_500, daysLeft: 31 },
    ]);
  });

  it("a card with an overdue and an upcoming bill shows the overdue one, first in the list", () => {
    const list = cardAlerts(
      cards({
        late: [bill("2026-11-04", 9_000), bill("2026-10-04", 6_000)],
        soon: [bill("2026-10-22", 1_000)],
      }),
      TODAY,
    );
    expect(list.map((a) => [a.cardId, a.dueDate, a.amount])).toEqual([
      ["late", "2026-10-04", 6_000],
      ["soon", "2026-10-22", 1_000],
    ]);
    expect(list[0].daysLeft).toBe(-16);
  });

  it("cards with nothing unpaid are left out; the first n cards by due date", () => {
    const seven = cards(
      Object.fromEntries(
        ["c1", "c2", "c3", "c4", "c5", "c6", "c7"].map((id, i) => [
          id,
          [bill(`2026-10-2${i}`, 100 * (i + 1))],
        ]),
      ),
    );
    const paid = cards({ paid: [bill("2026-10-01", 0)] });
    expect(cardAlerts({ ...seven, ...paid }, TODAY).map((a) => a.cardId)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
    ]);
    expect(cardAlerts(paid, TODAY)).toEqual([]);
  });
});
