import { describe, expect, it } from "vitest";
import { compareDumps, ttfbReport } from "../../scripts/parity/compare";
import { aliasIds, maskGenerated, maskTimestamps } from "../../scripts/parity/normalize";

// N-1.1 (D-068): the parity harness's masking and comparison, which decide what "the same
// behavior" means between the reference build and this repo's.

describe("Parity normalize (N-1.1)", () => {
  it("U-N-1.1.1 uuids get stable aliases; DB timestamps and the PDF render time are masked", () => {
    const a = "6f1c2b9e-0d3a-4c5e-9f00-aa11bb22cc33";
    const b = "00000000-0000-4000-8000-000000001000";
    expect(aliasIds(`${a} ${b} ${a.toUpperCase()}`)).toBe("<id1> <id2> <id1>");
    // The same rows with other random ids alias the same way.
    expect(aliasIds(`x ${b} y`)).toBe(aliasIds(`x ${a} y`));

    expect(maskTimestamps('{"createdAt":"2026-10-27T13:26:19.120Z","date":"2026-10-20"}')).toBe(
      '{"createdAt":"<ts>","date":"2026-10-20"}',
    );
    expect(maskTimestamps("at 2026-10-27 13:26:19.12+00")).toBe("at <ts>");

    expect(maskGenerated("Generated 20 Oct 2026, 11:03 AM · Computer-generated")).toBe(
      "Generated 20 Oct 2026, <time> · Computer-generated",
    );
    // A dated row's time elsewhere stays: only the render line moves with the clock.
    expect(maskGenerated("Paid 20 Oct 2026, 11:03 AM")).toBe("Paid 20 Oct 2026, 11:03 AM");
  });
});

describe("Parity compare (N-1.1)", () => {
  it("U-N-1.1.2 equal dumps pass; a changed line, an extra line and a missing file are reported", () => {
    const base = { "routes/a@360.txt": "one\ntwo\nthree", "files/x.txt": "x", "ttfb.json": "1" };
    expect(compareDumps(base, { ...base, "ttfb.json": "2" })).toEqual([]);

    expect(
      compareDumps(base, { ...base, "routes/a@360.txt": "one\nTWO\nthree", "files/x.txt": "x\ny" }),
    ).toEqual([
      { file: "files/x.txt", line: 2, expected: "(end of file)", actual: "y" },
      { file: "routes/a@360.txt", line: 2, expected: "two", actual: "TWO" },
    ]);

    const missing: Record<string, string> = { ...base };
    delete missing["files/x.txt"];
    expect(compareDumps(base, missing)).toEqual([
      { file: "files/x.txt", line: 0, expected: "(present)", actual: "(missing)" },
    ]);
  });

  it("U-N-1.1.3 TTFB is summed over the routes both sides have, as a % change", () => {
    expect(ttfbReport({ "/": 100, "/stock": 100, "/gone": 50 }, { "/": 120, "/stock": 110 })).toEqual(
      { routes: 2, before: 200, after: 230, change: 15 },
    );
  });
});
