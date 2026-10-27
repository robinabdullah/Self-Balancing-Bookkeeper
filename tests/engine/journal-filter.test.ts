import { describe, expect, it } from "vitest";
import { withQuery } from "@mbl/domain/href";
import {
  NO_FILTER,
  type JournalFilter,
  activeCount,
  filteredTotal,
  matches,
  parseFilter,
  periodMonth,
  periodOptions,
  rangeError,
  toQuery,
} from "@mbl/domain/journal-filter";

// U-CR-013.3 (D-032): the Journal's filters. Synthetic rows and ids.
const TODAY = "2026-10-09";
const WHO = "00000000-0000-4000-8000-000000000001";
const TYPES = ["sale", "expense", "card_payment"];
const row = (date: string, extra: Partial<Parameters<typeof matches>[0]> = {}) => ({
  type: "expense",
  date,
  forMonth: null,
  customerId: null,
  supplierId: null,
  cardId: null,
  personId: null,
  ...extra,
});
const f = (over: Partial<JournalFilter>): JournalFilter => ({ ...NO_FILTER, ...over });
const pass = (r: ReturnType<typeof row>, filter: JournalFilter, text = "", today = TODAY) =>
  matches(r, filter, today, text);

describe("U-CR-013.3 journal filters", () => {
  it("a month includes entries dated in it and entries marked “for” it", () => {
    const sep = f({ period: "2026-09" });
    expect(pass(row("2026-09-30"), sep)).toBe(true);
    expect(pass(row("2026-10-05", { forMonth: "2026-09" }), sep)).toBe(true); // Sep salary on 5 Oct
    expect(pass(row("2026-10-05"), sep)).toBe(false);
    expect(pass(row("2026-08-31"), sep)).toBe(false);
  });

  it("This month / Last month follow today, across a year boundary", () => {
    expect(periodMonth("this", TODAY)).toBe("2026-10");
    expect(periodMonth("last", TODAY)).toBe("2026-09");
    expect(periodMonth("last", "2027-01-05")).toBe("2026-12");
    expect(pass(row("2026-12-31"), f({ period: "last" }), "", "2027-01-05")).toBe(true);
    expect(pass(row("2027-01-01"), f({ period: "last" }), "", "2027-01-05")).toBe(false);
    expect(periodMonth("", TODAY)).toBeNull();
  });

  it("a custom range includes both ends; From after To matches nothing and is flagged", () => {
    const range = f({ period: "custom", from: "2026-10-01", to: "2026-10-05" });
    expect(["2026-10-01", "2026-10-05"].every((d) => pass(row(d), range))).toBe(true);
    expect(pass(row("2026-09-30"), range)).toBe(false);
    expect(pass(row("2026-10-06"), range)).toBe(false);
    expect(pass(row("2026-10-03"), f({ period: "custom", from: "2026-10-03" }))).toBe(true);
    const backwards = f({ period: "custom", from: "2026-10-05", to: "2026-10-01" });
    expect(rangeError(backwards)).toBe(true);
    expect(pass(row("2026-10-03"), backwards)).toBe(false);
    expect(rangeError(range)).toBe(false);
  });

  it("type and who; who matches any counterparty", () => {
    expect(pass(row("2026-10-01"), f({ type: "expense" }))).toBe(true);
    expect(pass(row("2026-10-01"), f({ type: "sale" }))).toBe(false);
    for (const key of ["customerId", "supplierId", "cardId", "personId"] as const) {
      expect(pass(row("2026-10-01", { [key]: WHO }), f({ who: WHO })), key).toBe(true);
    }
    expect(pass(row("2026-10-01"), f({ who: WHO }))).toBe(false);
  });

  it("search ignores case and spaces around it; empty matches everything", () => {
    const text = "Expense · Rent Arif · October rent";
    expect(pass(row("2026-10-01"), f({ q: "  OCTOBER " }), text)).toBe(true);
    expect(pass(row("2026-10-01"), f({ q: "arif" }), text)).toBe(true);
    expect(pass(row("2026-10-01"), f({ q: "salary" }), text)).toBe(false);
    expect(pass(row("2026-10-01"), f({ q: "  " }), text)).toBe(true);
  });

  it("parseFilter drops unknown and malformed values", () => {
    expect(
      parseFilter(
        {
          type: "nope",
          who: "abc",
          period: "2026-13",
          from: "2026-10-01",
          q: ["a", "b"],
          entry: "x",
        },
        TYPES,
      ),
    ).toEqual(NO_FILTER);
    expect(parseFilter({ period: "this", from: "2026-10-01" }, TYPES)).toEqual(
      f({ period: "this" }), // From/To only belong to a custom range
    );
    expect(parseFilter({ period: "custom", from: "2026-10-01", to: "2026-02-30x" }, TYPES)).toEqual(
      f({ period: "custom", from: "2026-10-01" }),
    );
    expect(parseFilter({ q: "x".repeat(500) }, TYPES).q).toHaveLength(100);
  });

  it("the URL round-trips: parseFilter(toQuery(f)) = f", () => {
    const filter = f({
      type: "expense",
      who: WHO,
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-09",
      q: "rent",
    });
    const url = new URL(withQuery("/journal", toQuery(filter)), "http://x");
    expect(parseFilter(Object.fromEntries(url.searchParams), TYPES)).toEqual(filter);
    expect(withQuery("/journal", toQuery(NO_FILTER))).toBe("/journal");
    expect(activeCount(filter)).toBe(4);
    expect(activeCount(NO_FILTER)).toBe(0);
  });

  it("Period choices run from this month back to the first month with entries", () => {
    expect(periodOptions("2026-06", TODAY).map(([v]) => v)).toEqual([
      "",
      "this",
      "last",
      "2026-08",
      "2026-07",
      "2026-06",
      "custom",
    ]);
    expect(periodOptions(null, TODAY).map(([v]) => v)).toEqual(["", "this", "last", "custom"]);
    expect(periodOptions("2026-06", TODAY)[3][1]).toBe("Aug 2026");
  });

  it("a total only when one type is filtered (integer poisha, signed amounts kept)", () => {
    const rows = [{ amount: 150_050 }, { amount: 49_950 }, { amount: -10_000 }];
    expect(filteredTotal(rows, f({ type: "expense" }))).toBe(190_000);
    expect(filteredTotal(rows, NO_FILTER)).toBeNull();
    expect(filteredTotal([], f({ type: "sale" }))).toBe(0);
  });
});
