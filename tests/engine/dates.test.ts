import { describe, expect, it } from "vitest";
import {
  addMonths,
  autoSlash,
  clampDay,
  daysInMonth,
  formatDmy,
  formatStamp,
  dhakaToday,
  isFuture,
  monthDiff,
  monthOf,
  parseDmy,
} from "@mbl/domain/dates";

describe("dates.ts (SRS §3, §6.1)", () => {
  it("U2.2.1 Dhaka today flips at 18:00Z (UTC+6)", () => {
    expect(dhakaToday(new Date("2026-10-06T18:30:00Z"))).toBe("2026-10-07");
    expect(dhakaToday(new Date("2026-10-06T17:59:00Z"))).toBe("2026-10-06");
    expect(dhakaToday(new Date("2026-12-31T18:00:00Z"))).toBe("2027-01-01");
  });

  it("U2.2.2 clamp a day to the month end", () => {
    expect(clampDay("2026-02", 31)).toBe("2026-02-28");
    expect(clampDay("2026-04", 31)).toBe("2026-04-30");
    expect(clampDay("2028-02", 31)).toBe("2028-02-29");
    expect(clampDay("2026-10", 5)).toBe("2026-10-05");
    expect(daysInMonth("2100-02")).toBe(28);
    expect(daysInMonth("2000-02")).toBe(29);
  });

  it("U2.2.3 month math across the year end", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(addMonths("2026-10", 15)).toBe("2028-01");
    expect(addMonths("2026-10", -22)).toBe("2024-12");
    expect(monthDiff("2026-12", "2027-01")).toBe(1);
    expect(monthDiff("2027-02", "2026-11")).toBe(-3);
    expect(monthDiff("2026-10", "2026-10")).toBe(0);
    expect(monthOf("2026-10-07")).toBe("2026-10");
    expect(monthOf("2026-10-01")).toBe("2026-10");
  });

  it("isFuture compares against the Dhaka today", () => {
    expect(isFuture("2026-10-08", "2026-10-07")).toBe(true);
    expect(isFuture("2026-10-07", "2026-10-07")).toBe(false);
    expect(isFuture("2026-09-30", "2026-10-07")).toBe(false);
  });

  it("3.3.5 the duplicate dialog's time is Dhaka time, with the date when not today", () => {
    const now = new Date("2026-10-07T10:00:00Z"); // 16:00 in Dhaka
    expect(formatStamp("2026-10-07T04:42:00Z", now)).toBe("10:42");
    expect(formatStamp("2026-10-06T18:05:00Z", now)).toBe("00:05"); // already the 7th in Dhaka
    expect(formatStamp("2026-10-06T17:59:00Z", now)).toBe("06 Oct 2026, 23:59");
  });

  it("U-CR-015.4 parseDmy reads dd/mm/yyyy (single digits allowed) into ISO", () => {
    expect(parseDmy("05/10/2026")).toBe("2026-10-05");
    expect(parseDmy("5/10/2026")).toBe("2026-10-05");
    expect(parseDmy("5/1/2026")).toBe("2026-01-05");
    expect(parseDmy(" 31/12/2026 ")).toBe("2026-12-31");
    expect(parseDmy("29/02/2028")).toBe("2028-02-29"); // leap year
    expect(parseDmy("29/02/2000")).toBe("2000-02-29");
  });

  it("U-CR-015.4 parseDmy rejects impossible dates, 2-digit years and junk", () => {
    for (const bad of [
      "31/02/2026",
      "29/02/2026",
      "29/02/2100",
      "31/04/2026",
      "00/10/2026",
      "05/13/2026",
      "05/00/2026",
      "05/10/26",
      "05/10/02026",
      "2026-10-05",
      "05-10-2026",
      "05/10",
      "",
      "aa/bb/cccc",
    ])
      expect(parseDmy(bad), bad).toBeNull();
  });

  it("U-CR-015.4 formatDmy shows ISO as dd/mm/yyyy and round-trips", () => {
    expect(formatDmy("2026-10-05")).toBe("05/10/2026");
    expect(formatDmy("")).toBe("");
    for (const iso of ["2026-01-01", "2028-02-29", "2026-12-31"])
      expect(parseDmy(formatDmy(iso))).toBe(iso);
  });

  it("U-CR-015.4 autoSlash adds the / while typing forward, never while deleting", () => {
    expect(autoSlash("0", "05")).toBe("05/");
    expect(autoSlash("05/1", "05/10")).toBe("05/10/");
    expect(autoSlash("5/1", "5/10")).toBe("5/10/");
    expect(autoSlash("5", "5/")).toBe("5/"); // a typed slash is kept
    expect(autoSlash("05/", "05")).toBe("05"); // deleting: no slash added back
    expect(autoSlash("05/10/", "05/10")).toBe("05/10");
    expect(autoSlash("05/10/202", "05/10/2026")).toBe("05/10/2026");
    expect(autoSlash("", "05102026")).toBe("05/10/2026"); // pasted digits
    expect(autoSlash("05/", "05//")).toBe("05/"); // no double slash
    expect(autoSlash("", "05/10/2026x")).toBe("05/10/2026"); // only digits and slashes
  });

  it("U-CR-045.1 autoSlash for a card's MM/YY expiry (D-067)", () => {
    const mmyy = (prev: string, next: string) => autoSlash(prev, next, [2, 2]);
    expect(mmyy("1", "12")).toBe("12/");
    expect(mmyy("12/2", "12/26")).toBe("12/26"); // no "/" after the year
    expect(mmyy("12/26", "12/267")).toBe("12/26"); // stops at 5 characters
    expect(mmyy("", "1226")).toBe("12/26"); // pasted digits
    expect(mmyy("12/", "12")).toBe("12"); // deleting: no slash added back
  });
});
