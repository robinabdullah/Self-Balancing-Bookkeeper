import { describe, expect, it } from "vitest";
import {
  type BillDates,
  type Card,
  billDates,
  billMonthOf,
  cardSummaries,
} from "@mbl/domain/engine/cards";
import {
  type Account,
  type MoneyEntry,
  type Posted,
  type PurchaseEntry,
} from "@mbl/domain/engine/post";
import { expectBalanced, posted } from "./invariant";
import { INVESTOR, INVESTOR_CARDS, investorRows } from "../fixtures/investor-cards";

// Synthetic ids only (D-014).
const EBL: Card = { id: "card-ebl", statementDay: 5, dueDay: 20 };
const SOUTHEAST: Card = { id: "card-southeast", statementDay: 19, dueDay: 4 };

const money = (m: Omit<MoneyEntry, "table">): MoneyEntry => ({ table: "money", ...m });
const buy = (date: string, amount: number, more: Partial<PurchaseEntry> = {}): PurchaseEntry => ({
  table: "purchase",
  source: "card",
  cardId: EBL.id,
  date,
  lines: [{ qty: 1, unitCost: amount }],
  ...more,
});
const payCard = (date: string, amount: number, more: Partial<MoneyEntry> = {}) =>
  money({ type: "card_payment", cardId: EBL.id, date, amount, ...more });

const all = (entries: Posted[]) => entries.flatMap((e) => e.effects);
const total = (entries: Posted[], account: Account, month?: string) =>
  all(entries)
    .filter((e) => e.account === account && (month ? e.month === month : true))
    .reduce((n, e) => n + e.amount, 0);
const ebl = (entries: Posted[], asOf: string, overrides: BillDates[] = []) =>
  cardSummaries(entries, [EBL], overrides, asOf)[EBL.id];

describe("U2.6.1 statement and due dates from the usual days", () => {
  it("EBL (5/20): statement 5 Oct → due 20 Oct, the same month", () => {
    expect(billDates(EBL, "2026-10")).toEqual({
      statementDate: "2026-10-05",
      dueDate: "2026-10-20",
      statementActual: false,
      dueActual: false,
    });
  });

  it("Southeast (19/4): statement 19 Oct → due 4 Nov, the next month", () => {
    const d = billDates(SOUTHEAST, "2026-10");
    expect([d.statementDate, d.dueDate]).toEqual(["2026-10-19", "2026-11-04"]);
  });

  it("days past the month end are clamped", () => {
    const d = billDates({ id: "c", statementDay: 31, dueDay: 30 }, "2027-02");
    expect([d.statementDate, d.dueDate]).toEqual(["2027-02-28", "2027-03-30"]);
  });
});

describe("U2.6.2 a charge on the statement date is in that bill", () => {
  it("5 Oct → the Oct bill; 6 Oct → the Nov bill", () => {
    expect(billMonthOf(EBL, "2026-10-05")).toBe("2026-10");
    expect(billMonthOf(EBL, "2026-10-06")).toBe("2026-11");
    const s = ebl(
      [posted(buy("2026-10-05", 100_000)), posted(buy("2026-10-06", 200_000))],
      "2026-10-06",
    );
    expect(s.bills.map((b) => [b.month, b.amount])).toEqual([
      ["2026-10", 100_000],
      ["2026-11", 200_000],
    ]);
  });

  it("a bill_month_override wins over the date", () => {
    expect(billMonthOf(EBL, "2026-10-06", "2026-10-01")).toBe("2026-10");
  });
});

describe("U2.6.3 an actual date override", () => {
  const override: BillDates = {
    cardId: EBL.id,
    billMonth: "2026-10-01",
    actualStatementDate: "2026-10-07",
    actualDueDate: "2026-10-22",
  };

  it("changes the statement/due dates and marks them actual", () => {
    const s = ebl([posted(buy("2026-10-06", 100_000))], "2026-10-06", [override]);
    expect(s.bills).toEqual([
      {
        month: "2026-10",
        statementDate: "2026-10-07",
        dueDate: "2026-10-22",
        statementActual: true,
        dueActual: true,
        amount: 100_000,
        paid: 0,
        remaining: 100_000,
      },
    ]);
    expect(s.nextDue).toEqual({ date: "2026-10-22", amount: 100_000 });
  });

  it("an actual statement alone moves the estimated due after it", () => {
    const only = { ...override, actualDueDate: null };
    const d = billDates(EBL, "2026-10", new Map([["2026-10", only]]));
    expect(d).toMatchObject({ dueDate: "2026-10-20", statementActual: true, dueActual: false });
  });
});

describe("U2.6.4 S4: card purchase, cashback a month later", () => {
  const story = [
    posted(buy("2026-09-10", 2_000_000)),
    posted(
      money({
        type: "cashback",
        source: "card",
        cardId: EBL.id,
        date: "2026-10-10",
        amount: 100_000,
      }),
    ),
  ];

  it("balance ৳19,000; profit +৳1,000 in the cashback month; cash unchanged", () => {
    expect(ebl(story, "2026-10-31").balance).toBe(1_900_000);
    expect(total(story, "profit", "2026-10")).toBe(100_000);
    expect(total(story, "profit", "2026-09")).toBe(0);
    expect(total(story, "cash")).toBe(0);
    expectBalanced(story);
  });
});

describe("U2.6.5 S5: cash-out ৳1,00,000 charged, ৳98,500 received", () => {
  const story = [
    posted(
      money({
        type: "card_cash_out",
        cardId: EBL.id,
        date: "2026-10-02",
        amount: 10_000_000,
        cardCharged: 10_000_000,
        cashReceived: 9_850_000,
      }),
    ),
  ];

  it("card +৳1,00,000; cash +৳98,500; expense ৳1,500", () => {
    expect(ebl(story, "2026-10-02").balance).toBe(10_000_000);
    expect(total(story, "cash")).toBe(9_850_000);
    expect(total(story, "profit", "2026-10")).toBe(-150_000);
    expectBalanced(story);
  });
});

describe("U2.6.6 S6 (D-002): early payment before the statement, then a new purchase", () => {
  const story = [
    posted(buy("2026-09-10", 4_000_000)),
    posted(payCard("2026-09-25", 4_000_000)),
    posted(buy("2026-09-28", 2_500_000)),
  ];

  it("as of 30 Sep: one Oct bill ৳65,000 / paid ৳40,000 / remaining ৳25,000", () => {
    const s = ebl(story, "2026-09-30");
    expect(s.balance).toBe(2_500_000);
    expect(s.bills.map((b) => [b.month, b.amount, b.paid, b.remaining])).toEqual([
      ["2026-10", 6_500_000, 4_000_000, 2_500_000],
    ]);
    expect(s.nextDue).toEqual({ date: "2026-10-20", amount: 2_500_000 });
    expect(total(story, "cash")).toBe(-4_000_000);
    expect(total(story, "stock")).toBe(6_500_000);
    expectBalanced(story);
  });
});

describe("U2.6.7 S7: EMI ৳60,000 over 6 months", () => {
  const story = [posted(buy("2026-09-10", 6_000_000, { emiMonths: 6 }))];

  it("balance +৳60,000 at once; 6 bills of ৳10,000 from the purchase's own bill", () => {
    const s = ebl(story, "2026-09-30");
    expect(s.balance).toBe(6_000_000);
    expect(s.bills.map((b) => [b.month, b.amount])).toEqual(
      ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"].map((m) => [m, 1_000_000]),
    );
    expect(s.remainingEmi).toBe(6_000_000);
    expect(s.nextDue).toEqual({ date: "2026-10-20", amount: 1_000_000 });
    expectBalanced(story);
  });

  it("once the Oct statement is out, ৳50,000 of EMI remains", () => {
    expect(ebl(story, "2026-10-05").remainingEmi).toBe(5_000_000);
  });
});

describe("U2.6.8 statuses", () => {
  const sepBuy = posted(buy("2026-09-10", 100_000)); // Oct bill, due 20 Oct

  it("Check dates: an actual due date on or before the statement", () => {
    const bad = { cardId: EBL.id, billMonth: "2026-10", actualDueDate: "2026-10-04" };
    expect(ebl([sepBuy], "2026-10-06", [bad]).status).toBe("check_dates");
  });

  it("Card credit: paid more than charged", () => {
    expect(ebl([posted(payCard("2026-10-01", 100_000))], "2026-10-06")).toMatchObject({
      balance: -100_000,
      status: "card_credit",
      nextDue: null,
    });
  });

  it("Clear: nothing owed", () => {
    expect(ebl([sepBuy, posted(payCard("2026-10-01", 100_000))], "2026-10-06").status).toBe(
      "clear",
    );
  });

  it("Overdue: a bill past its due date with something left", () => {
    expect(ebl([posted(buy("2026-08-10", 100_000))], "2026-10-06")).toMatchObject({
      status: "overdue",
      overdue: 100_000,
    });
  });

  it("Due today", () => {
    expect(ebl([sepBuy], "2026-10-20")).toMatchObject({
      status: "due_today",
      dueWithin7Days: 100_000,
    });
  });

  it("Due within 7 days", () => {
    expect(ebl([sepBuy], "2026-10-14")).toMatchObject({
      status: "due_within_7_days",
      dueWithin7Days: 100_000,
      unbilled: 0,
    });
  });

  it("Upcoming: due more than 7 days away; not yet billed", () => {
    expect(ebl([sepBuy], "2026-09-30")).toMatchObject({
      status: "upcoming",
      dueWithin7Days: 0,
      unbilled: 100_000,
    });
  });
});

describe("U-CR-002.2 next due skips an overdue bill (D-021)", () => {
  it("next due = the later bill; overdue = the older bill's remaining", () => {
    const story = [posted(buy("2026-08-10", 1_000_000)), posted(buy("2026-09-10", 2_000_000))];
    expect(ebl(story, "2026-10-06")).toMatchObject({
      balance: 3_000_000,
      overdue: 1_000_000,
      nextDue: { date: "2026-10-20", amount: 2_000_000 },
      status: "overdue",
    });
  });
});

describe("U-N-0.4 the investor card fixture as of 2026-10-06 (SRS §6)", () => {
  const rows = investorRows();
  const asOf = "2026-10-06";
  const byName = () => cardSummaries(rows, INVESTOR_CARDS, [], asOf);

  it("U-N-0.4.1 18 rows that keep the books balanced", () => {
    expect(rows).toHaveLength(18);
    expectBalanced(rows);
  });

  it.each([
    ["Kite Visa", 3_550_050, "2026-11-04"],
    ["Lotus Visa", 25_000_000, "2026-11-03"],
    ["Delta Visa", 6_525_075, "2026-10-20"],
    ["Harbor Visa", 18_000_000, "2026-11-14"],
    ["Summit Visa", 2_500_000, "2026-10-25"],
    ["River Visa", 9_000_000, "2026-10-12"],
  ])("U-N-0.4.2 %s: balance and next due match", (name, balance, due) => {
    const s = byName()[name];
    expect(s.balance).toBe(balance);
    expect(s.nextDue).toEqual({ date: due, amount: balance });
  });

  it("U-N-0.4.3 Kite: Sep bill ৳65,000 fully paid; Oct bill ৳50,500.50 − ৳15,000", () => {
    const bills = byName()["Kite Visa"].bills.map((b) => [b.month, b.amount, b.remaining]);
    expect(bills).toEqual([
      ["2026-09", 6_500_000, 0],
      ["2026-10", 5_050_050, 3_550_050],
    ]);
  });

  it("U-N-0.4.4 Delta: a cash-out on the statement day is in that bill", () => {
    expect(byName()["Delta Visa"].bills.map((b) => [b.month, b.amount])).toEqual([
      ["2026-10", 6_525_075],
    ]);
  });

  it("U-N-0.4.5 River Amex = Clear; River Visa = due within 7 days", () => {
    expect(byName()["River Amex"]).toMatchObject({ balance: 0, nextDue: null, status: "clear" });
    expect(byName()["River Visa"].status).toBe("due_within_7_days");
  });

  it("U-N-0.4.6 total ৳6,45,751.25; cash-outs ৳1,90,000 (6); cash invested ৳8,00,000", () => {
    const sum = Object.values(byName()).reduce((n, s) => n + s.balance, 0);
    expect(sum).toBe(64_575_125);
    const cashOuts = rows.filter((r) => r.kind === "card_cash_out");
    expect(cashOuts).toHaveLength(6);
    expect(total(cashOuts, "card")).toBe(19_000_000);
    expect(total(cashOuts, "cash")).toBe(19_000_000);
    expect(
      all(rows.filter((r) => r.kind === "capital_in"))
        .filter((e) => e.account === "capital" && e.id === INVESTOR)
        .reduce((n, e) => n + e.amount, 0),
    ).toBe(80_000_000);
  });
});
