import { describe, expect, it } from "vitest";
import { formatDate, formatMonth } from "@/lib/dates";
import {
  type Calendar,
  closeErrors,
  dateErrors,
  defaultReversal,
  deleteErrors,
  editErrors,
  isLocked,
  lotEditErrors,
  pairEditErrors,
  reversalDateErrors,
  reverseErrors,
  walkInErrors,
} from "@/lib/guards";

// Opened 1 Sep 2026; September is closed; today is 7 Nov 2026.
const cal: Calendar = { today: "2026-11-07", openingDate: "2026-09-01", lastClosed: "2026-09" };
const open: Calendar = { ...cal, lastClosed: null };
const WALK_IN = "walk-in-id";

describe("guards.ts (SRS §3, §7, §8; D-003, D-005, D-009)", () => {
  it("formats months and dates per UIDD §2", () => {
    expect(formatMonth("2026-09")).toBe("Sep 2026");
    expect(formatMonth("2026-10-01")).toBe("Oct 2026");
    expect(formatDate("2026-10-06")).toBe("06 Oct 2026");
  });

  it("U2.9.1 a future date is rejected; today is allowed", () => {
    expect(dateErrors({ date: "2026-11-08" }, open)).toEqual({
      date: "Date can't be in the future",
    });
    expect(dateErrors({ date: "2026-11-07" }, open)).toEqual({});
  });

  it("U2.9.2 a date before the opening date is rejected; the opening date is allowed", () => {
    expect(dateErrors({ date: "2026-08-31" }, open)).toEqual({
      date: "Date is before the opening date (01 Sep 2026)",
    });
    expect(dateErrors({ date: "2026-09-01" }, open)).toEqual({});
    // Before the opening import there is no opening date yet.
    expect(dateErrors({ date: "2026-08-31" }, { ...open, openingDate: null })).toEqual({});
  });

  it("U2.9.3 a for_month before the opening month is rejected", () => {
    expect(dateErrors({ date: "2026-10-05", forMonth: "2026-08" }, open)).toEqual({
      forMonth: "Month is before the opening month (Sep 2026)",
    });
    expect(dateErrors({ date: "2026-10-05", forMonth: "2026-09-01" }, open)).toEqual({});
  });

  it("U2.9.4 for_month 2026-11 on a 2026-10-28 expense is rejected (D-005)", () => {
    expect(dateErrors({ date: "2026-10-28", forMonth: "2026-11" }, open)).toEqual({
      forMonth: "Month can't be after the date's month (Oct 2026)",
    });
    expect(dateErrors({ date: "2026-10-28", forMonth: "2026-10" }, open)).toEqual({});
    expect(dateErrors({ date: "2026-10-28", forMonth: "2026-09" }, open)).toEqual({});
  });

  it("U2.9.5 lock rule: locked by its date or its for_month", () => {
    expect(isLocked({ date: "2026-09-30" }, "2026-09")).toBe(true);
    expect(isLocked({ date: "2026-10-02", forMonth: "2026-09-01" }, "2026-09")).toBe(true);
    expect(isLocked({ date: "2026-10-01", forMonth: "2026-10" }, "2026-09")).toBe(false);
    expect(isLocked({ date: "2026-09-30" }, null)).toBe(false);
  });

  it("U2.9.6 a new entry in a closed month is rejected (date or for_month)", () => {
    expect(dateErrors({ date: "2026-09-15" }, cal)).toEqual({
      date: "Date is in a closed month (Sep 2026)",
    });
    expect(dateErrors({ date: "2026-10-03", forMonth: "2026-09" }, cal)).toEqual({
      forMonth: "Month is closed (Sep 2026)",
    });
    expect(dateErrors({ date: "2026-10-03", forMonth: "2026-10" }, cal)).toEqual({});
  });

  it("U2.9.7 reverse eligibility (D-003)", () => {
    const plain = { reversesId: null };
    const none = { reversed: false, hasDependents: false };
    expect(reverseErrors(plain, none)).toEqual({});
    // A reversal of a reversal is rejected.
    expect(reverseErrors({ reversesId: "orig" }, none)).toEqual({
      form: "A reversal can't be reversed — delete it, or enter the original again",
    });
    expect(reverseErrors(plain, { ...none, reversed: true })).toEqual({
      form: "This entry is already reversed",
    });
    // A sale with returns, or a purchase whose lots have sales or returns.
    expect(reverseErrors(plain, { ...none, hasDependents: true })).toEqual({
      form: "Other entries depend on this one — reverse them first",
    });
  });

  it("U-CR-007.1 a reversed entry and a reversal can't be edited (D-026)", () => {
    expect(pairEditErrors({ reversesId: null }, false)).toEqual({});
    expect(pairEditErrors({ reversesId: null }, true)).toEqual({
      form: "A reversed entry can't be edited — delete the reversal first",
    });
    expect(pairEditErrors({ reversesId: "orig" }, false)).toEqual({
      form: "A reversal can't be edited — delete it and reverse again",
    });
  });

  it("U2.9.8 default reversal date and the chosen date", () => {
    // Original in an open month → its own date and for_month.
    const octExpense = { date: "2026-10-28", forMonth: "2026-10-01" };
    expect(defaultReversal(octExpense, cal)).toEqual({ date: "2026-10-28", forMonth: "2026-10" });
    // The reversal of a locked October entry defaults to today.
    const octClosed = { ...cal, lastClosed: "2026-10" };
    expect(defaultReversal(octExpense, octClosed)).toEqual({
      date: "2026-11-07",
      forMonth: "2026-11",
    });
    // A sale has no for_month.
    expect(defaultReversal({ date: "2026-10-05" }, octClosed)).toEqual({
      date: "2026-11-07",
      forMonth: null,
    });
    // Locked by for_month alone → today.
    expect(defaultReversal({ date: "2026-10-02", forMonth: "2026-09" }, cal)).toEqual({
      date: "2026-11-07",
      forMonth: "2026-11",
    });
    // Never before the original's date; never in a closed month.
    expect(
      reversalDateErrors(octExpense, { date: "2026-10-27", forMonth: "2026-10" }, cal),
    ).toEqual({ date: "A reversal can't be dated before the original (28 Oct 2026)" });
    expect(
      reversalDateErrors(octExpense, { date: "2026-11-01", forMonth: "2026-10" }, octClosed),
    ).toEqual({ forMonth: "Month is closed (Oct 2026)" });
    expect(
      reversalDateErrors(octExpense, { date: "2026-10-28", forMonth: "2026-10" }, cal),
    ).toEqual({});
  });

  it("U2.9.9 delete and edit eligibility; lot cost/qty edits", () => {
    const row = { date: "2026-10-05" };
    const none = { reversed: false, hasDependents: false };
    expect(deleteErrors(row, none, "2026-09")).toEqual({});
    // An open-month reversal can be deleted (D-003).
    const reversal = { ...row, reversesId: "orig" };
    expect(deleteErrors(reversal, none, "2026-09")).toEqual({});
    expect(deleteErrors(row, { ...none, reversed: true }, "2026-09")).toEqual({
      form: "This entry has a reversal — delete the reversal first",
    });
    // A lot with sales or returns, or a sale line with returns.
    expect(deleteErrors(row, { ...none, hasDependents: true }, "2026-09")).toEqual({
      form: "Other entries depend on this one — delete or reverse them first",
    });
    const locked = { form: "This entry is in a closed month (Oct 2026) — reverse it instead" };
    expect(deleteErrors(row, none, "2026-10")).toEqual(locked);
    expect(editErrors(row, "2026-10")).toEqual(locked);
    expect(editErrors(row, "2026-09")).toEqual({});

    // A lot's unit cost/qty edit is blocked when any of its sales/returns is in a closed month.
    expect(lotEditErrors(["2026-10-03", "2026-09-20"], "2026-09")).toEqual({
      form: "This lot has sales or returns in a closed month (Sep 2026) — its cost and qty can't change",
    });
    expect(lotEditErrors(["2026-10-03"], "2026-09")).toEqual({});
    expect(lotEditErrors([], "2026-09")).toEqual({});
  });

  it("U2.9.10 Walk-in limits (D-009)", () => {
    const money = (type: string, customerId: string) => ({
      table: "money" as const,
      type,
      customerId,
    });
    const msg = { customerId: "Walk-in can't be used here — pick a customer" };
    // A Walk-in profit share is rejected.
    expect(walkInErrors(money("customer_profit_share", WALK_IN), WALK_IN)).toEqual(msg);
    expect(walkInErrors(money("customer_cash_given", WALK_IN), WALK_IN)).toEqual(msg);
    const offset = { table: "purchase" as const, source: "customer_offset", customerId: WALK_IN };
    expect(walkInErrors(offset, WALK_IN)).toEqual(msg);
    // Allowed: a Walk-in payment or sale; a real customer's profit share.
    expect(walkInErrors(money("customer_payment", WALK_IN), WALK_IN)).toEqual({});
    expect(walkInErrors({ table: "sale", customerId: WALK_IN }, WALK_IN)).toEqual({});
    expect(walkInErrors(money("customer_profit_share", "milon"), WALK_IN)).toEqual({});
  });
});

describe("closeErrors (SRS §7 step 1; D-028)", () => {
  it("U-CR-009.3 already closed, not started, out of order → rejected; the next month → ok", () => {
    const form = (month: string, next: string) => closeErrors(month, next, cal).form;
    expect(form("2026-09", "2026-10")).toBe(`${formatMonth("2026-09")} is already closed`);
    expect(form("2026-12", "2026-12")).toBe(`${formatMonth("2026-12")} hasn't started`);
    expect(form("2026-11", "2026-10")).toBe(`Close ${formatMonth("2026-10")} first`);
    expect(closeErrors("2026-10", "2026-10", cal)).toEqual({});
    // The current month can be closed on any day (PRD §4.4).
    expect(closeErrors("2026-11", "2026-11", cal)).toEqual({});
  });
});
