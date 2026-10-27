import { describe, expect, it } from "vitest";
import {
  type CardRow,
  available,
  cardDetail,
  cardRows,
  groupByOwner,
  searchCards,
} from "@mbl/domain/card-view";
import { type BillDates, type Card, cardSummaries } from "@mbl/domain/engine/cards";
import type { MoneyEntry, PurchaseEntry } from "@mbl/domain/engine/post";
import { expectBalanced, posted } from "./invariant";

// Task 4.4 (UIDD §4.8): the Cards summary table and a card's detail, off `cardSummaries`.
// Synthetic ids only (D-014).

const EBL: Card = { id: "card-ebl", statementDay: 5, dueDay: 20 };
const CITY: Card = { id: "card-city", statementDay: 28, dueDay: 12 };
const setupCard = (card: Card, creditLimit: string | null) => ({
  ...card,
  name: card.id,
  network: "none" as const,
  ownerPersonId: "p-arif",
  owner: "Arif",
  display: `Arif · ${card.id}`,
  creditLimit,
  active: true,
});

const buy = (date: string, amount: number, more: Partial<PurchaseEntry> = {}): PurchaseEntry => ({
  table: "purchase",
  source: "card",
  cardId: EBL.id,
  date,
  lines: [{ qty: 1, unitCost: amount }],
  ...more,
});
const payCard = (date: string, amount: number): MoneyEntry => ({
  table: "money",
  type: "card_payment",
  cardId: EBL.id,
  date,
  amount,
});

const charge = posted(buy("2026-09-10", 100_000)); // Oct bill, due 20 Oct
const emi = posted(buy("2026-09-12", 6_000_000, { emiMonths: 6 })); // Oct … Mar bills
const payment = posted(payCard("2026-09-20", 40_000));
const story = [charge, emi, payment];

describe("4.4 cards summary and detail", () => {
  it("U4.4.1 rows carry the engine's balance, next due, overdue and status; Available ≈ = limit − balance, blank without a limit", () => {
    const summaries = cardSummaries(story, [EBL, CITY], [], "2026-09-30");
    const rows = cardRows([setupCard(EBL, "5000000.00"), setupCard(CITY, null)], summaries);
    expect(rows.map((r) => [r.id, r.balance, r.available, r.status, r.overdue])).toEqual([
      [EBL.id, 6_060_000, 50_00_000_00 - 6_060_000, "upcoming", 0],
      [CITY.id, 0, null, "clear", 0],
    ]);
    expect(rows[0].nextDue).toEqual({ date: "2026-10-20", amount: 100_000 + 1_000_000 - 40_000 });
    expect(available(100_000, 150_000)).toBe(-50_000); // over the limit shows negative
    expectBalanced(story, "2026-09-30");
  });

  it("U4.4.2 charges (with their bill month) and credits, newest first; EMI plans billed / remaining", () => {
    const asOf = "2026-11-05"; // the Oct and Nov statements are out
    const s = cardSummaries(story, [EBL], [], asOf)[EBL.id];
    const { moves, emiPlans, bills } = cardDetail(s);
    expect(moves).toEqual([
      { entryId: payment.id, date: "2026-09-20", amount: -40_000, billMonth: null },
      { entryId: emi.id, date: "2026-09-12", amount: 6_000_000, billMonth: "2026-10" },
      { entryId: charge.id, date: "2026-09-10", amount: 100_000, billMonth: "2026-10" },
    ]);
    expect(emiPlans).toEqual([
      {
        entryId: emi.id,
        date: "2026-09-12",
        total: 6_000_000,
        months: 6,
        billed: 2_000_000,
        remaining: 4_000_000,
      },
    ]);
    expect(s.remainingEmi).toBe(4_000_000);
    expect(bills.map((b) => b.month)).toEqual([
      "2027-03",
      "2027-02",
      "2027-01",
      "2026-12",
      "2026-11",
      "2026-10",
    ]);
    expectBalanced(story, asOf);
  });

  it("U4.4.3 an actual due date moves that bill's due date (actual) and the card's status", () => {
    const asOf = "2026-10-15";
    const before = cardSummaries([charge], [EBL], [], asOf)[EBL.id];
    expect([before.bills[0].dueDate, before.bills[0].dueActual, before.status]).toEqual([
      "2026-10-20",
      false,
      "due_within_7_days",
    ]);
    const moved: BillDates = {
      cardId: EBL.id,
      billMonth: "2026-10-01",
      actualDueDate: "2026-10-14",
    };
    const after = cardSummaries([charge], [EBL], [moved], asOf)[EBL.id];
    expect([after.bills[0].dueDate, after.bills[0].dueActual, after.status]).toEqual([
      "2026-10-14",
      true,
      "overdue",
    ]);
    expect(after.overdue).toBe(100_000);
    expectBalanced([charge], asOf);
  });
});

describe("U-CR-033.3 the Cards list: search and owner groups (D-056)", () => {
  const card = (id: string, ownerId: string, owner: string, name: string, balance: number) =>
    ({
      id,
      ownerId,
      owner,
      name,
      network: name.endsWith("Amex") ? "none" : "visa",
      display: `${owner} · ${name}`,
      balance,
    }) as CardRow;
  const rows = [
    card("c1", "p-r", "Sumon", "Prime", 8_325_700),
    card("c2", "p-r", "Sumon", "LBF", -20_000), // in credit
    card("c3", "p-b", "Arif", "City Amex", 9_290_200),
    card("c4", "p-b", "Arif", "EBL", 11_862_397),
    card("c5", "p-b", "Arif", "City", 0),
  ];

  it("matches the owner, the card name or the Type, in any case; blank shows all", () => {
    expect(searchCards(rows, "")).toBe(rows);
    expect(searchCards(rows, "  arif ").map((r) => r.id)).toEqual(["c3", "c4", "c5"]);
    expect(searchCards(rows, "CITY").map((r) => r.id)).toEqual(["c3", "c5"]);
    expect(searchCards(rows, "visa").map((r) => r.id)).toEqual(["c1", "c2", "c4", "c5"]);
    expect(searchCards(rows, "ebl visa").map((r) => r.id)).toEqual(["c4"]);
    expect(searchCards(rows, "nobody")).toEqual([]);
  });

  it("groups in order; the heading counts and totals only the cards shown; credit nets", () => {
    const all = groupByOwner(rows, rows);
    expect(all.map((g) => [g.owner, g.rows.length, g.of, g.balance])).toEqual([
      ["Sumon", 2, 2, 8_325_700 - 20_000],
      ["Arif", 3, 3, 9_290_200 + 11_862_397],
    ]);
    for (const g of all) expect(g.balance).toBe(g.rows.reduce((n, r) => n + r.balance, 0)); // = the column's sum
    const city = groupByOwner(searchCards(rows, "city amex"), rows);
    expect(city.map((g) => [g.owner, g.rows.length, g.of, g.balance])).toEqual([
      ["Arif", 1, 3, 9_290_200],
    ]);
  });
});
