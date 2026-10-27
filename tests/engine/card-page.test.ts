import { describe, expect, it } from "vitest";
import { billToPay, emiLabel, ordinal, visibleBills } from "@mbl/domain/card-view";

// U-CR-013.4 (D-032): the card page's statements, Pay button, EMI label and bill days.
// Synthetic bills (poisha), newest first as the page shows them.
const TODAY = "2026-10-09";
const bill = (month: string, statementDate: string, remaining: number) => ({
  month,
  statementDate,
  remaining,
});

describe("U-CR-013.4 card page helpers", () => {
  const emiCard = [
    bill("2027-03", "2027-03-05", 434_733),
    bill("2027-02", "2027-02-05", 434_733),
    bill("2027-01", "2027-01-05", 2_313_499),
    bill("2026-12", "2026-12-05", 2_579_416),
    bill("2026-11", "2026-11-05", 2_579_416),
    bill("2026-10", "2026-10-05", 3_520_600),
    bill("2026-09", "2026-09-05", 0), // paid
  ];

  it("shows the unpaid billed bills and the next one; paid and later EMI bills wait", () => {
    const { shown, hiddenCount } = visibleBills(emiCard, TODAY);
    expect(shown.map((b) => b.month)).toEqual(["2026-11", "2026-10"]);
    expect(hiddenCount).toBe(5);
  });

  it("an overdue bill always shows; a statement dated today counts as out", () => {
    const bills = [
      bill("2026-11", "2026-11-19", 5_000),
      bill("2026-10", TODAY, 7_000),
      bill("2026-08", "2026-08-19", 1_000), // overdue
    ];
    expect(visibleBills(bills, TODAY).shown.map((b) => b.month)).toEqual([
      "2026-11",
      "2026-10",
      "2026-08",
    ]);
  });

  it("everything paid → only the next bill, or nothing", () => {
    expect(visibleBills([bill("2026-09", "2026-09-05", 0)], TODAY)).toEqual({
      shown: [],
      hiddenCount: 1,
    });
    const paidAndNext = [bill("2026-11", "2026-11-05", 0), bill("2026-10", "2026-10-05", 0)];
    expect(visibleBills(paidAndNext, TODAY).shown.map((b) => b.month)).toEqual(["2026-11"]);
  });

  it("Pay goes on the oldest unpaid bill (a payment pays the oldest first, SRS §6.5)", () => {
    expect(billToPay(emiCard)).toBe("2026-10");
    expect(billToPay([bill("2026-10", "2026-10-05", 0)])).toBeNull();
  });

  it("an EMI label names the installment and the first bill", () => {
    expect(emiLabel({ total: 2_173_665, months: 5 }, "2026-11")).toBe(
      "EMI 5 × ৳4,347.33 · from Nov 2026",
    );
    // 100.01 / 3 = 33.33 + 33.33 + 33.35 (the remainder in the last, SRS §6.4)
    expect(emiLabel({ total: 10_001, months: 3 }, "2026-12")).toBe(
      "EMI 3 × ৳33.33 (last ৳33.35) · from Dec 2026",
    );
  });

  it("ordinal day names", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
    ]);
  });
});
