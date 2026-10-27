import { describe, expect, it } from "vitest";
import { statementRange, statementRowsOf } from "@/lib/accounts";
import { billsIn, creditSplit, emiSchedule } from "@/lib/card-view";
import { computeBooks } from "@/lib/engine/index";
import { add, sub } from "@/lib/money";
import { monthlyPack } from "@/lib/monthly-pack";
import { salesReport } from "@/lib/sales-report";
import { CARD, TODAY, books, data, snapshots, stock, typeOf } from "./report-fixture";

// CR-025 (D-045; UIDD §4.8): a card's statement for a period, read as on its last day: its bills,
// the credit split and the EMI schedule tie out to the engine's card summary, and a bill paid
// after the period shows what was left on the last day, as the Monthly pack does. Synthetic data.

const tk = (n: number) => n * 100;
const octEnd = computeBooks(data, "2026-10-31");

describe("U-CR-025.2 card statement: bills as on the end, the credit split, the EMI schedule", () => {
  it("the EMI schedule: splitEven from the first bill; the unbilled part = the plan's remaining", () => {
    const s = octEnd.cards[CARD];
    const [plan] = s.emiPlans;
    const first = s.moves.find((m) => m.entryId === plan.entryId)!.billMonth!;
    const schedule = emiSchedule(plan, first, s.bills, "2026-10-31");
    expect(schedule).toEqual([
      { month: "2026-10", amount: tk(2_000), billed: true },
      { month: "2026-11", amount: tk(2_000), billed: false },
      { month: "2026-12", amount: tk(2_000), billed: false },
    ]);
    expect(schedule.reduce((n, i) => add(n, i.amount), 0)).toBe(plan.total);
    const unbilled = schedule.filter((i) => !i.billed).reduce((n, i) => add(n, i.amount), 0);
    expect(unbilled).toBe(plan.remaining);
    expect(unbilled).toBe(s.remainingEmi);
  });

  it("bills in the period as on its last day; a later payment doesn't change them", () => {
    const [oct] = billsIn(octEnd.cards[CARD].bills, "2026-10-01", "2026-10-31");
    expect(oct).toMatchObject({
      month: "2026-10",
      amount: tk(2_000),
      paid: tk(100),
      remaining: tk(1_900),
    });
    // Today (10 Nov) the 5 Nov payment has paid more of it: the October report still says 1,900.
    const [now] = billsIn(books.cards[CARD].bills, "2026-10-01", "2026-10-31");
    expect(now.remaining).toBe(tk(900));
  });

  it("the same bill reads the same in the October Monthly pack (§7, overdue at the end)", () => {
    const pack = monthlyPack({
      month: "2026-10",
      today: TODAY,
      firstMonth: "2026-09",
      books,
      atStart: computeBooks(data, "2026-09-30"),
      atEnd: octEnd,
      snapshots,
      allocations: data.allocations,
      closed: data.closed,
      sales: salesReport([], []),
      stockLines: stock,
      typeOf,
      typeLabel: (t) => t,
    });
    const row = pack.cards.bills.find((b) => b.cardId === CARD && b.month === "2026-10")!;
    expect(row).toMatchObject({ remaining: tk(1_900), overdue: true });
    const [oct] = billsIn(octEnd.cards[CARD].bills, "2026-10-01", "2026-10-31");
    expect(row.remaining).toBe(oct.remaining);
  });

  it("the credit split: charges − payments − refunds = the period's change in the balance", () => {
    const sep = computeBooks(data, "2026-09-30");
    const split = creditSplit(sep.cards[CARD].moves, "2026-09-01", "2026-09-30", typeOf);
    expect(split).toEqual({ charges: tk(11_000), payments: tk(3_000), refunds: tk(100) });
    const range = statementRange(
      statementRowsOf("card", CARD, books, TODAY),
      "2026-09-01",
      "2026-09-30",
    );
    expect(sub(sub(split.charges, split.payments), split.refunds)).toBe(
      sub(range.closing, range.opening),
    );
  });

  it("a reversed card payment nets to 0 within payments", () => {
    const moves = [
      { entryId: "p", date: "2026-10-02", amount: -1_000 },
      { entryId: "r", date: "2026-10-03", amount: 1_000 },
    ];
    const split = creditSplit(moves, "2026-10-01", "2026-10-31", () => "card_payment");
    expect(split).toEqual({ charges: 0, payments: 0, refunds: 0 });
  });
});
