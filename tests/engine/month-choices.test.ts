import { describe, expect, it } from "vitest";
import { addMonths } from "@mbl/domain/dates";
import { type Calendar, dateErrors, reversalDateErrors } from "@mbl/domain/guards";
import { billMonthChoices, forMonthChoices } from "@mbl/domain/month-choices";

// Opened 1 Sep 2026; September is closed; today is 7 Nov 2026 (as guards.test.ts).
const cal: Calendar = { today: "2026-11-07", openingDate: "2026-09-01", lastClosed: "2026-09" };
const values = (list: { value: string }[]) => list.map((c) => c.value);

describe("U-CR-015.5 month dropdown choices mirror the guards (D-035)", () => {
  it("For month: opening month → the date's month, newest first, closed flagged", () => {
    expect(forMonthChoices(cal, "2026-11-07")).toEqual([
      { value: "2026-11", label: "Nov 2026", closed: false },
      { value: "2026-10", label: "Oct 2026", closed: false },
      { value: "2026-09", label: "Sep 2026", closed: true },
    ]);
  });

  it("every offered open month passes dateErrors; each end's neighbour fails it", () => {
    for (const date of ["2026-10-15", "2026-11-07"]) {
      const list = forMonthChoices(cal, date);
      for (const c of list)
        expect(dateErrors({ date, forMonth: c.value }, cal).forMonth, c.value).toBe(
          c.closed ? `Month is closed (${c.label})` : undefined,
        );
      const [newest, oldest] = [list[0].value, list[list.length - 1].value];
      expect(dateErrors({ date, forMonth: addMonths(newest, 1) }, cal).forMonth).toMatch(/after/);
      expect(dateErrors({ date, forMonth: addMonths(oldest, -1) }, cal).forMonth).toMatch(/before/);
    }
  });

  it("the reverse dialog offers what reversalDateErrors allows for its date", () => {
    const original = { date: "2026-10-03", forMonth: "2026-10" };
    const date = "2026-10-20";
    const list = forMonthChoices(cal, date);
    expect(values(list)).toEqual(["2026-10", "2026-09"]);
    for (const c of list.filter((c) => !c.closed))
      expect(reversalDateErrors(original, { date, forMonth: c.value }, cal)).toEqual({});
  });

  it("with no opening yet (a fresh database): the 12 months up to the date's month", () => {
    const fresh: Calendar = { today: "2026-11-07", openingDate: null, lastClosed: null };
    const list = values(forMonthChoices(fresh, "2026-11-07"));
    expect(list).toHaveLength(12);
    expect(list[0]).toBe("2026-11");
    expect(list[11]).toBe("2025-12");
    for (const m of list)
      expect(dateErrors({ date: "2026-11-07", forMonth: m }, fresh)).toEqual({});
  });

  it("keeps the current or stored month even when it isn't allowed (never switches silently)", () => {
    expect(values(forMonthChoices(cal, "2026-10-15", "2026-11"))).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
    ]);
    expect(values(forMonthChoices(cal, "2026-11-07", "2026-08"))).toEqual([
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
    expect(values(forMonthChoices(cal, "2026-11-07", "2026-10"))).toHaveLength(3); // no duplicate
  });

  it("Bill month: the month before the purchase → 4 months after, in calendar order", () => {
    expect(values(billMonthChoices("2026-11-07"))).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
    expect(billMonthChoices("2026-11-07").every((c) => !c.closed)).toBe(true);
    expect(values(billMonthChoices("2026-11-07", "2027-06")).at(-1)).toBe("2027-06");
    expect(values(billMonthChoices("2026-11-07", "2026-01"))[0]).toBe("2026-01");
  });
});
