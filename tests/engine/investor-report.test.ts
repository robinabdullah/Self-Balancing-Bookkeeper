import { describe, expect, it } from "vitest";
import { creditSplit } from "@mbl/domain/card-view";
import { type BooksData, computeBooks } from "@mbl/domain/engine/index";
import { type Allocation, computeClose, monthProfit } from "@mbl/domain/engine/months";
import { dayBefore, investorReport, owedBySum } from "@mbl/domain/investor-report";
import { add } from "@mbl/domain/money";
import {
  CARD,
  SUMON,
  ARIF,
  NADIM,
  TODAY,
  allocations,
  books,
  data,
  person,
  setupCards,
  typeOf,
} from "./report-fixture";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-025 (D-045; UIDD §4.17): the Investor / Partner report ties out to the books: capital as on
// the period's last day, the profit roll-forward to today's profit owed, the stored allocations,
// the cards as on the end, and the card payments equal to the card statement's. Synthetic data.

const tk = (n: number) => n * 100;
const report = (id: string, from: string, to: string, d: BooksData = data) => {
  const today = computeBooks(d, TODAY);
  const end = to < TODAY ? to : TODAY;
  return investorReport({
    person: person(id),
    books: today,
    atEnd: computeBooks(d, end),
    beforeFrom: computeBooks(d, dayBefore(from)),
    allocations: d.allocations,
    closed: d.closed,
    cards: setupCards,
    from,
    to,
    today: TODAY,
    typeOf,
  });
};

describe("U-CR-025.1 investorReport: capital, cards, allocations, the profit roll-forward", () => {
  it("the fixture's books balance (books-balance invariant)", () => {
    expectBalanced(books.posted, TODAY, allocations, data.closed);
    expectBalanced(books.posted, "2026-09-30", allocations, data.closed);
  });

  it("capital: opening + the signed groups = closing = the books' capital on the last day", () => {
    const r = report(NADIM, "2026-09-01", "2026-10-31");
    const closing = computeBooks(data, "2026-10-31").capital[NADIM];
    expect(r.capital.closing).toBe(closing);
    expect(r.capital.opening + r.capital.groups.reduce((n, g) => add(n, g.amount), 0)).toBe(
      closing,
    );
    expect(r.capital.groups).toEqual([
      { label: "Added", amount: tk(50_000) },
      { label: "Reinvested", amount: tk(1_000) },
      { label: "Opening & corrections", amount: tk(100_000) },
    ]);
  });

  it("a capital_in reversed in the period nets to 0 and is left out; capital out is negative", () => {
    const arif = report(ARIF, "2026-10-01", "2026-10-31");
    expect(arif.capital.groups.map((g) => g.label)).not.toContain("Added");
    expect(arif.capital.closing).toBe(arif.capital.opening);
    const sumon = report(SUMON, "2026-10-01", "2026-10-31");
    expect(sumon.capital.groups).toEqual([{ label: "Taken out (cash)", amount: tk(-10_000) }]);
  });

  it("the roll-forward sums to today's profit owed, for any period", () => {
    for (const [from, to] of [
      ["2026-09-01", "2026-09-30"],
      ["2026-10-01", "2026-10-31"],
      ["2026-09-01", "2026-11-30"],
    ]) {
      const r = report(NADIM, from, to);
      expect(owedBySum(r.profit)).toBe(books.profitOwed[NADIM]);
      expect(r.profit.owedNow).toBe(books.profitOwed[NADIM]);
    }
    const oct = report(NADIM, "2026-10-01", "2026-10-31");
    expect(oct.profit.before).toBe(tk(3_090)); // September's allocation, before October
    expect(oct.profit.allocated).toBe(0);
    expect(oct.profit.paid.map((l) => l.amount)).toEqual([tk(2_000)]);
    expect(oct.profit.reinvested.map((l) => l.amount)).toEqual([tk(1_000)]);
    expect(oct.profit.owedNow).toBe(tk(90));
  });

  it("a later closed month is its own line; a re-opened month is 'not allocated yet'", () => {
    // October closed too, with Nadim's cash allocation.
    const octProfit = monthProfit(books.posted, "2026-10", TODAY);
    const inv: Allocation[] = [
      {
        month: "2026-10-01",
        personId: NADIM,
        kind: "cash",
        basis: tk(150_000),
        ratePct: 1,
        amount: tk(1_500),
      },
    ];
    const both: BooksData = {
      ...data,
      allocations: [...allocations, ...inv, ...computeClose(octProfit, inv, PARTNERS)],
      closed: ["2026-09-01", "2026-10-01"],
    };
    const sep = report(NADIM, "2026-09-01", "2026-09-30", both);
    expect(sep.profit.later).toBe(tk(1_500));
    expect(owedBySum(sep.profit)).toBe(computeBooks(both, TODAY).profitOwed[NADIM]);

    const reopened: BooksData = { ...data, allocations: [], closed: [] };
    const r = report(NADIM, "2026-09-01", "2026-09-30", reopened);
    expect(r.months).toEqual([{ month: "2026-09", rows: null, basisNote: false }]);
    expect(r.open).toBe(true);
    expect(owedBySum(r.profit)).toBe(computeBooks(reopened, TODAY).profitOwed[NADIM]);
  });

  it("allocations: the stored rows of closed months; an open month is null", () => {
    const r = report(NADIM, "2026-09-01", "2026-10-31");
    expect(r.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(r.months[0].rows?.map((a) => [a.kind, a.amount])).toEqual([
      ["cash", tk(3_000)],
      ["card", tk(90)],
    ]);
    expect(r.months[1].rows).toBeNull();
    expect(r.open).toBe(true);
    expect(r.months[0].basisNote).toBe(false); // basis 1,50,000 = capital on 30 Sep
    const typed = allocations.map((a) => (a.kind === "cash" ? { ...a, basis: tk(140_000) } : a));
    expect(
      report(NADIM, "2026-09-01", "2026-09-30", { ...data, allocations: typed }).months[0]
        .basisNote,
    ).toBe(true);
  });

  it("cards: as on the end, used cards only; card payments = the card statement's", () => {
    const r = report(NADIM, "2026-09-01", "2026-09-30");
    const atEnd = computeBooks(data, "2026-09-30");
    expect(r.cards.map((c) => c.id)).toEqual([CARD]);
    expect(r.cards[0].balance).toBe(atEnd.cards[CARD].balance);
    expect(r.cards[0].remainingEmi).toBe(atEnd.cards[CARD].remainingEmi);
    expect(r.cardPayments).toBe(tk(3_000)); // the cashback to the card is not a payment
    const statement = creditSplit(atEnd.cards[CARD].moves, "2026-09-01", "2026-09-30", typeOf);
    expect(r.cardPayments).toBe(statement.payments);
    expect(report(NADIM, "2026-09-01", "2026-10-31").cardPayments).toBe(tk(5_000));
  });

  it("a partner: the share % and the opening difference on the last day", () => {
    const r = report(ARIF, "2026-09-01", "2026-09-30");
    expect(r.partner).toEqual({ sharePct: 50, openingDifference: tk(2_500) });
    expect(report(NADIM, "2026-09-01", "2026-09-30").partner).toBeNull();
  });
});
