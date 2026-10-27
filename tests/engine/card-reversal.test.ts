import { describe, expect, it } from "vitest";
import { statementRange, statementRowsOf } from "@mbl/domain/accounts";
import { cardDetail, cardRows, creditSplit } from "@mbl/domain/card-view";
import { cardAlerts, cardDues } from "@mbl/domain/dashboard";
import { type Card, cardSummaries } from "@mbl/domain/engine/cards";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry, Posted, PurchaseEntry } from "@mbl/domain/engine/post";
import { dayBefore, investorReport } from "@mbl/domain/investor-report";
import { add, splitShares } from "@mbl/domain/money";
import { monthlyPack } from "@mbl/domain/monthly-pack";
import { salesReport } from "@mbl/domain/sales-report";
import { PARTNERS, expectBalanced, posted } from "./invariant";
import {
  CARD,
  NADIM,
  TODAY,
  data,
  entries,
  person,
  setupCards,
  snapshots,
  stock,
  typeOf,
} from "./report-fixture";

// CR-034 (D-058; SRS §6.5, §8): a reversed card entry and its reversal both drop out of the card's
// bills once the reversal is dated on or before "as on"; the balance still sums both. Synthetic
// ids and amounts only (D-014).
const EBL: Card = { id: "card-ebl", statementDay: 5, dueDay: 20 };

const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const buy = (date: string, amount: number, more: Partial<PurchaseEntry> = {}): PurchaseEntry => ({
  table: "purchase",
  source: "card",
  cardId: EBL.id,
  date,
  lines: [{ qty: 1, unitCost: amount }],
  ...more,
});
const payCard = (date: string, amount: number) =>
  money({ type: "card_payment", cardId: EBL.id, date, amount });
/** Posts `entry` and its reversal dated `on`, as the Reverse action stores them. */
const reversed = (entry: Entry, on: string): [Posted, Posted] => {
  const original = posted(entry);
  return [original, posted({ ...entry, date: on, reversesId: original.id })];
};
const ebl = (entries: Posted[], asOf: string) => cardSummaries(entries, [EBL], [], asOf)[EBL.id];
const sumMoves = (s: ReturnType<typeof ebl>) => s.moves.reduce((n, m) => add(n, m.amount), 0);
/** What the bills read; the pair's absence is compared against a story without it. */
const billView = (s: ReturnType<typeof ebl>) => ({
  bills: s.bills,
  nextDue: s.nextDue,
  overdue: s.overdue,
  dueWithin7Days: s.dueWithin7Days,
  unbilled: s.unbilled,
  remainingEmi: s.remainingEmi,
  emiPlans: s.emiPlans,
  status: s.status,
  balance: s.balance,
});

// The user's card: an opening Oct bill ৳9,275.09 + an EMI 3 × ৳2,666.50 from Nov (D-055).
const opening = (amount: number, billMonth: string, emiMonths: number | null = null) =>
  money({
    type: "opening",
    openingKind: "card_balance",
    cardId: EBL.id,
    date: "2026-10-01",
    amount,
    billMonthOverride: `${billMonth}-01`,
    emiMonths,
  });
const difference = (total: number) =>
  splitShares(
    0 - total,
    PARTNERS.map((p) => p.pct),
  ).map((amount, i) =>
    money({
      type: "opening",
      openingKind: "opening_difference",
      personId: PARTNERS[i].id,
      date: "2026-10-01",
      amount,
    }),
  );
const userCard = () =>
  [opening(927_509, "2026-10"), opening(799_950, "2026-11", 3), ...difference(1_727_459)].map((e) =>
    posted(e),
  );

describe("U-CR-034.1 the user's case: a reversed card payment leaves the Oct bill due", () => {
  it("Oct bill unpaid, due within 7 days ৳9,275.09, Nov ৳2,666.50, the balance unchanged", () => {
    const before = userCard();
    const story = [...before, ...reversed(payCard("2026-10-10", 1_746_800), "2026-10-10")];
    const s = ebl(story, "2026-10-14");
    expect(s.bills.map((b) => [b.month, b.amount, b.paid, b.remaining])).toEqual([
      ["2026-10", 927_509, 0, 927_509],
      ["2026-11", 266_650, 0, 266_650],
      ["2026-12", 266_650, 0, 266_650],
      ["2027-01", 266_650, 0, 266_650],
    ]);
    expect(s).toMatchObject({
      balance: 1_727_459,
      status: "due_within_7_days",
      dueWithin7Days: 927_509,
      nextDue: { date: "2026-10-20", amount: 927_509 },
      overdue: 0,
      remainingEmi: 799_950,
    });
    // Exactly as before the payment was entered.
    expect(billView(s)).toEqual(billView(ebl(before, "2026-10-14")));
    expectBalanced(story, "2026-10-14");
  });

  it("both rows stay in the moves, flagged and on no bill", () => {
    const [pay, rev] = reversed(payCard("2026-10-10", 1_746_800), "2026-10-10");
    const s = ebl([...userCard(), pay, rev], "2026-10-14");
    expect(s.moves.filter((m) => m.entryId === pay.id || m.entryId === rev.id)).toEqual([
      { entryId: pay.id, date: "2026-10-10", amount: -1_746_800, billMonth: null, reversed: true },
      { entryId: rev.id, date: "2026-10-10", amount: 1_746_800, billMonth: null, reversal: true },
    ]);
    expect(s.balance).toBe(sumMoves(s));
  });
});

describe("U-CR-034.2 a payment reversed after its due date", () => {
  it("that bill is Overdue", () => {
    const story = [...userCard(), ...reversed(payCard("2026-10-10", 1_746_800), "2026-10-22")];
    expect(ebl(story, "2026-10-22")).toMatchObject({
      status: "overdue",
      overdue: 927_509,
      nextDue: { date: "2026-11-20", amount: 266_650 },
      balance: 1_727_459,
    });
    expectBalanced(story, "2026-10-22");
  });
});

describe("U-CR-034.3 a reversed purchase leaves its own bill", () => {
  it("an older bill is not paid by it; its bill month disappears", () => {
    const augBuy = posted(buy("2026-08-10", 4_000_000)); // Sep bill
    const story = [augBuy, ...reversed(buy("2026-09-10", 2_500_000), "2026-09-12")]; // Oct bill
    const s = ebl(story, "2026-09-12");
    expect(s.balance).toBe(4_000_000);
    expect(s.bills.map((b) => [b.month, b.amount, b.paid, b.remaining])).toEqual([
      ["2026-09", 4_000_000, 0, 4_000_000],
    ]);
    expectBalanced(story, "2026-09-12");
  });
});

describe("U-CR-034.4 a reversed EMI purchase", () => {
  it("no instalments, no plan, Remaining EMI down by what was left of it", () => {
    const kept = posted(buy("2026-08-10", 3_000_000, { emiMonths: 3 }));
    const pair = reversed(buy("2026-09-10", 6_000_000, { emiMonths: 6 }), "2026-11-10");
    const asOf = "2026-11-10";
    const all = ebl([kept, pair[0]], "2026-11-09");
    const left = all.emiPlans.find((p) => p.entryId === pair[0].id)!.remaining;
    expect(left).toBe(4_000_000);
    const s = ebl([kept, ...pair], asOf);
    expect(s.emiPlans.map((p) => p.entryId)).toEqual([kept.id]);
    expect(s.remainingEmi).toBe(all.remainingEmi - left);
    expect(s.bills.map((b) => [b.month, b.amount])).toEqual([
      ["2026-09", 1_000_000],
      ["2026-10", 1_000_000],
      ["2026-11", 1_000_000],
    ]);
    expect(billView(s)).toEqual(billView(ebl([kept], asOf)));
    expectBalanced([kept, ...pair], asOf);
  });
});

describe("U-CR-034.5 every card entry type: the pair drops out", () => {
  const base = () => [posted(buy("2026-09-01", 1_000_000))]; // the Sep bill
  const types: [string, Entry][] = [
    [
      "cash-out",
      money({
        type: "card_cash_out",
        cardId: EBL.id,
        date: "2026-09-02",
        amount: 9_850_000,
        cardCharged: 10_000_000,
        cashReceived: 9_850_000,
      }),
    ],
    ["card fee", money({ type: "card_fee", cardId: EBL.id, date: "2026-09-02", amount: 50_000 })],
    [
      "cashback",
      money({
        type: "cashback",
        source: "card",
        cardId: EBL.id,
        date: "2026-09-02",
        amount: 20_000,
      }),
    ],
    [
      "purchase return to card",
      {
        table: "return",
        kind: "purchase",
        date: "2026-09-02",
        refundTo: "card",
        cardId: EBL.id,
        reason: "returned",
        lines: [{ qty: 1, unitAmount: 900_000, unitCost: 1_000_000 }],
      },
    ],
    ["opening item", { ...opening(500_000, "2026-09"), date: "2026-09-01" }],
  ];
  for (const [name, entry] of types)
    it(`${name}: bills as without it; the balance = the sum of all moves`, () => {
      const pair = reversed(entry, "2026-09-03");
      const s = ebl([...base(), ...pair], "2026-09-03");
      expect(billView(s)).toEqual(billView(ebl(base(), "2026-09-03")));
      expect(s.balance).toBe(sumMoves(s));
      expect(s.moves.filter((m) => m.reversed || m.reversal).map((m) => m.entryId)).toEqual(
        pair.map((p) => p.id),
      );
      // An opening item is one-sided; the reversed pair nets to 0, so the rest still balances.
      expectBalanced([...base(), ...pair], "2026-09-03");
    });
});

describe("U-CR-034.6 as on a date before the reversal", () => {
  it("the original counts as entered; on or after the reversal's date the pair is gone", () => {
    const pair = reversed(payCard("2026-10-10", 1_746_800), "2026-11-03");
    const story = [...userCard(), ...pair];
    const before = ebl(story, "2026-10-31");
    expect(before.bills[0]).toMatchObject({ month: "2026-10", paid: 927_509, remaining: 0 });
    expect(before.moves.some((m) => m.reversed || m.reversal)).toBe(false);
    expect(before.balance).toBe(1_727_459 - 1_746_800);
    const after = ebl(story, "2026-11-03");
    expect(after.bills[0]).toMatchObject({ month: "2026-10", paid: 0, remaining: 927_509 });
    expect(after).toMatchObject({ status: "overdue", overdue: 927_509, balance: 1_727_459 });
    expectBalanced(story, "2026-10-31");
    expectBalanced(story, "2026-11-03");
  });
});

describe("U-CR-034.7 the reports agree after a reversal", () => {
  // The CR-025 business: its 20 Oct card payment (৳2,000) reversed on 6 Nov.
  const octPay = entries.find(
    (e): e is StoredEntry & MoneyEntry =>
      e.table === "money" && e.type === "card_payment" && e.date === "2026-10-20",
  )!;
  const reversal: StoredEntry = {
    ...octPay,
    id: "e-reversal",
    date: "2026-11-06",
    createdAt: "2026-11-06T10:00:00.000Z",
    reversesId: octPay.id,
  };
  const d: BooksData = { ...data, entries: [...data.entries, reversal] };
  const without: BooksData = { ...data, entries: data.entries.filter((e) => e !== octPay) };
  const books = computeBooks(d, TODAY);
  const s = books.cards[CARD];
  // A reversal keeps its original's type (as `typeOfEntries` reads it).
  const typeOfD = (id: string) => (id === reversal.id ? "card_payment" : typeOf(id));

  it("the card's bills read as if the payment had never been entered", () => {
    expect(billView(s)).toEqual(billView(computeBooks(without, TODAY).cards[CARD]));
    expect(books.invariant.difference).toBe(0);
  });

  it("card page, Cards list, Home alert, monthly pack and investor report read the same bills", () => {
    // Card page: the same bills, newest first.
    expect(cardDetail(s).bills).toEqual([...s.bills].reverse());
    // Cards list.
    const [row] = cardRows([setupCards[0]], books.cards);
    expect(row).toMatchObject({
      balance: s.balance,
      nextDue: s.nextDue,
      overdue: s.overdue,
      status: s.status,
    });
    // Home: the alert is the oldest unpaid bill; the dues chip the card's overdue + week.
    const oldest = s.bills.find((b) => b.remaining > 0)!;
    const alert = cardAlerts(books.cards, TODAY).find((a) => a.cardId === CARD)!;
    expect(alert).toMatchObject({ dueDate: oldest.dueDate, amount: oldest.remaining });
    expect(cardDues(books.cards).overdue).toBe(s.overdue);
    // The November pack (read as on today).
    const pack = monthlyPack({
      month: "2026-11",
      today: TODAY,
      firstMonth: "2026-09",
      books,
      atStart: computeBooks(d, "2026-10-31"),
      atEnd: books,
      snapshots,
      allocations: d.allocations,
      closed: d.closed,
      sales: salesReport([], []),
      stockLines: stock,
      typeOf: typeOfD,
      typeLabel: (t) => t,
    });
    for (const b of pack.cards.bills.filter((x) => x.cardId === CARD)) {
      const bill = s.bills.find((x) => x.month === b.month)!;
      expect(b).toMatchObject({ amount: bill.amount, remaining: bill.remaining });
    }
    expect(pack.cards.emi.find((e) => e.cardId === CARD)?.remaining ?? 0).toBe(s.remainingEmi);
    // The investor report (Nadim owns the card) for Oct–Nov.
    const report = investorReport({
      person: person(NADIM),
      books,
      atEnd: books,
      beforeFrom: computeBooks(d, dayBefore("2026-10-01")),
      allocations: d.allocations,
      closed: d.closed,
      cards: setupCards,
      from: "2026-10-01",
      to: TODAY,
      today: TODAY,
      typeOf: typeOfD,
    });
    expect(report.cards.find((c) => c.id === CARD)).toMatchObject({
      balance: s.balance,
      nextDue: s.nextDue,
      overdue: s.overdue,
      remainingEmi: s.remainingEmi,
    });
  });

  it("the credit split and the statement stay net of the reversal", () => {
    // Oct–Nov payments: 2,000 + 1,000 − the 2,000 reversed = 1,000; the balance moves as before.
    const split = creditSplit(s.moves, "2026-10-01", TODAY, typeOfD);
    expect(split.payments).toBe(100_000);
    const range = statementRange(statementRowsOf("card", CARD, books, TODAY), "2026-10-01", TODAY);
    expect(range.closing).toBe(s.balance);
    expect(range.lines.map((l) => l.entryId)).toContain(reversal.id);
  });
});
