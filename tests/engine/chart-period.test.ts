import { describe, expect, it } from "vitest";
import { chartPeriod } from "@/lib/charts/period";

const OPENING = "2026-10-01";

describe("chartPeriod (D-064, UIDD §4.17)", () => {
  it("U-CR-040.3 6M: this month + the 5 before, to today; month buckets capped at today", () => {
    const p = chartPeriod({}, "2027-05-20", OPENING);
    expect(p).toMatchObject({ key: "6m", from: "2026-12-01", to: "2027-05-20", view: "month" });
    expect(p.buckets.map((b) => b.key)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
    expect(p.buckets[0]).toEqual({
      key: "2026-12",
      label: "Dec 2026",
      start: "2026-12-01",
      end: "2026-12-31",
    });
    expect(p.buckets[1].end).toBe("2027-01-31");
    expect(p.buckets.at(-1)).toMatchObject({ start: "2027-05-01", end: "2027-05-20" });
    expect(p.prev).toBeNull(); // Jun–Nov 2026 starts before the opening
  });

  it("U-CR-040.3 the previous window is set only when all of it is on or after the opening", () => {
    const p = chartPeriod({ period: "6m" }, "2027-11-15", "2026-12-01");
    expect(p).toMatchObject({ from: "2027-06-01", to: "2027-11-15" });
    expect(p.prev).toEqual({ from: "2026-12-01", to: "2027-05-31" }); // starts on the opening
    expect(chartPeriod({ period: "6m" }, "2027-11-15", "2026-12-02").prev).toBeNull();
  });

  it("U-CR-040.3 12M and This year, clipped at the opening", () => {
    const twelve = chartPeriod({ period: "12m" }, "2027-05-20", OPENING);
    expect(twelve).toMatchObject({ key: "12m", from: OPENING, to: "2027-05-20", view: "month" });
    expect(twelve.buckets).toHaveLength(8); // Oct 2026 … May 2027
    expect(twelve.prev).toBeNull();

    const year = chartPeriod({ period: "year" }, "2027-05-20", "2025-01-01");
    expect(year).toMatchObject({ key: "year", from: "2027-01-01", to: "2027-05-20" });
    expect(year.prev).toEqual({ from: "2026-08-01", to: "2026-12-31" }); // 5 months before

    // The first year: the window starts at the opening, 23 days → drawn by day.
    const first = chartPeriod({ period: "year" }, "2026-10-23", OPENING);
    expect(first).toMatchObject({ from: OPENING, to: "2026-10-23", view: "day" });
    expect(first.buckets).toHaveLength(23);
    expect(first.buckets[0]).toEqual({
      key: OPENING,
      label: "01 Oct 2026",
      start: OPENING,
      end: OPENING,
    });
    expect(first.prev).toBeNull();
  });

  it("U-CR-040.3 custom: day view at ≤ 62 days, month view at 63; the previous window", () => {
    const day = chartPeriod({ from: "2026-11-01", to: "2027-01-01" }, "2027-05-20", "2026-01-01");
    expect(day).toMatchObject({ key: "custom", view: "day" });
    expect(day.buckets).toHaveLength(62);
    expect(day.prev).toEqual({ from: "2026-08-31", to: "2026-10-31" }); // 62 days before

    const month = chartPeriod({ from: "2026-11-01", to: "2027-01-02" }, "2027-05-20", "2026-01-01");
    expect(month.view).toBe("month");
    expect(month.buckets.map((b) => [b.key, b.end])).toEqual([
      ["2026-11", "2026-11-30"],
      ["2026-12", "2026-12-31"],
      ["2027-01", "2027-01-02"],
    ]);
    expect(month.prev).toEqual({ from: "2026-08-01", to: "2026-10-31" }); // 3 months before
  });

  it("U-CR-040.3 custom is clipped at the opening and today; an empty range falls back to 6M", () => {
    const clipped = chartPeriod({ from: "2026-09-01", to: "2027-12-31" }, "2027-05-20", OPENING);
    expect(clipped).toMatchObject({ key: "custom", from: OPENING, to: "2027-05-20" });
    expect(clipped.buckets[0]).toMatchObject({ key: "2026-10", start: OPENING });

    const before = chartPeriod({ from: "2026-01-01", to: "2026-02-01" }, "2027-05-20", OPENING);
    expect(before).toMatchObject({ key: "6m", from: "2026-12-01" });

    expect(chartPeriod({ from: "2027-01-31", to: "2027-01-01" }, "2027-05-20", OPENING).key).toBe(
      "6m",
    );
    expect(chartPeriod({ period: "5y" }, "2027-05-20", OPENING).key).toBe("6m");
    expect(chartPeriod({ period: ["12m", "6m"] }, "2027-05-20", OPENING).key).toBe("6m");
  });
});
