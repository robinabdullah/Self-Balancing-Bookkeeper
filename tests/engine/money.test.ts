import { describe, expect, it } from "vitest";
import {
  add,
  avgTaka,
  avgUnit,
  compact,
  format,
  mul,
  parse,
  pct,
  splitEven,
  splitShares,
  sub,
  toDecimal,
} from "@mbl/domain/money";

const sum = (xs: number[]) => xs.reduce(add, 0);

describe("money.ts (SRS §3, UIDD §2, D-015)", () => {
  it("U2.1.1 parse: lakh grouping, decimals, rejects bad input without rounding", () => {
    expect(parse("1,00,000")).toBe(10_000_000);
    expect(parse("17444.8")).toBe(1_744_480);
    expect(parse("0.50")).toBe(50);
    expect(parse(" 2,500 ")).toBe(250_000);
    expect(parse("-120")).toBe(-12_000);
    for (const bad of ["abc", "", "1.005", ".", "1.", "1e3", "12-3", "৳100"]) {
      expect(parse(bad), bad).toBeNull();
    }
  });

  it("U2.1.2 format: ৳ + lakh grouping, decimals only when non-zero, minus sign", () => {
    expect(format(751_234_500)).toBe("৳75,12,345");
    expect(format(1_744_480)).toBe("৳17,444.80");
    expect(format(0)).toBe("৳0");
    expect(format(-1_744_480)).toBe("-৳17,444.80");
    expect(format(10_000_000)).toBe("৳1,00,000");
    expect(format(5)).toBe("৳0.05");
    expect(format(99_999)).toBe("৳999.99");
  });

  it("U2.1.3 pct rounds half-up", () => {
    expect(pct(1, 50)).toBe(1);
    expect(pct(10_000_000, 2.5)).toBe(250_000);
    expect(pct(10_000_000, 1.125)).toBe(112_500);
    expect(pct(333, 1.125)).toBe(4); // 3.746… → 4
    expect(pct(-1, 50)).toBe(-1); // half away from zero, like splitShares
    expect(() => pct(100, 1.0005)).toThrow();
    expect(() => pct(100, -1)).toThrow();
  });

  it("U2.1.4 splitShares: residual to the first partner; sum is always the total", () => {
    expect(splitShares(100_000, [50, 50])).toEqual([50_000, 50_000]);
    expect(splitShares(1, [50, 50])).toEqual([0, 1]);
    expect(sum(splitShares(1, [50, 50]))).toBe(1);
    expect(splitShares(-12_000, [50, 50])).toEqual([-6_000, -6_000]);

    let seed = 42;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0; // deterministic LCG
      return seed % n;
    };
    for (let i = 0; i < 1_000; i++) {
      const total = rand(2_000_000_001) - 1_000_000_000;
      const first = rand(100_001) / 1000; // 0.000–100.000
      const shares = splitShares(total, [first, 100 - first]);
      expect(sum(shares)).toBe(total);
      shares.forEach((s) => expect(Number.isSafeInteger(s)).toBe(true));
    }
  });

  it("U2.1.5 splitEven: equal parts, remainder in the last", () => {
    expect(splitEven(6_000_000, 6)).toEqual(Array(6).fill(1_000_000));
    expect(splitEven(10_000, 3)).toEqual([3_333, 3_333, 3_334]);
    expect(() => splitEven(10_000, 0)).toThrow();
  });

  it("U2.1.6 no float: 0.1 + 0.2-style inputs are exact", () => {
    expect(add(parse("0.1")!, parse("0.2")!)).toBe(parse("0.3"));
    expect(parse("1.15")).toBe(115); // 1.15 * 100 = 114.99999… in floats
    expect(parse("17444.80")).toBe(1_744_480);
    expect(sub(parse("0.3")!, parse("0.1")!)).toBe(20);
    expect(mul(parse("17444.8")!, 3)).toBe(5_233_440);
    expect(() => mul(100, 1.5)).toThrow();
    expect(() => add(0.1, 0.2)).toThrow();
  });

  it("toDecimal: poisha → numeric(14,2) text that parse reads back (task 3.1)", () => {
    expect(toDecimal(1_744_480)).toBe("17444.80");
    expect(toDecimal(5)).toBe("0.05");
    expect(toDecimal(0)).toBe("0.00");
    expect(toDecimal(-12_000)).toBe("-120.00");
    for (const p of [1_744_480, 5, -12_000]) expect(parse(toDecimal(p))).toBe(p);
    expect(() => toDecimal(0.5)).toThrow();
  });

  it("U-CR-033.1 avgUnit: total ÷ pieces, half-up to whole taka; null with nothing to average", () => {
    expect(avgUnit(parse("471000")!, 30)).toBe(parse("15700")); // exact
    expect(avgUnit(parse("471000")!, 29)).toBe(parse("16241")); // 16,241.379…
    expect(avgUnit(parse("301")!, 2)).toBe(parse("151")); // 150.50 → 151 (half-up)
    expect(avgUnit(parse("300.98")!, 2)).toBe(parse("150")); // 150.49 → 150
    expect(avgUnit(0, 3)).toBe(0);
    expect(avgUnit(parse("1000")!, 0)).toBeNull();
    expect(avgUnit(parse("1000")!, -2)).toBeNull();
    expect(avgUnit(parse("-1000")!, 2)).toBeNull();
    expect(() => avgUnit(0.5, 2)).toThrow();
  });

  it("U-CR-040.1 compact: each unit's threshold, one decimal under 10, moving up a unit, sign", () => {
    const t = (taka: string) => compact(parse(taka)!);
    expect(t("0")).toBe("৳0");
    expect(t("850")).toBe("৳850");
    expect(t("849.50")).toBe("৳850"); // half away from zero
    expect(t("849.49")).toBe("৳849");
    expect(t("999.49")).toBe("৳999");
    expect(t("999.60")).toBe("৳1K"); // rounds to 1,000 → moves up
    expect(t("1000")).toBe("৳1K");
    expect(t("1250")).toBe("৳1.3K"); // 1.25 → 1.3
    expect(t("9940")).toBe("৳9.9K");
    expect(t("9960")).toBe("৳10K"); // 9.96 → 10.0: no decimal from 10 up
    expect(t("45000")).toBe("৳45K");
    expect(t("45499")).toBe("৳45K");
    expect(t("99960")).toBe("৳1 L"); // 100K → 1 L
    expect(t("100000")).toBe("৳1 L");
    expect(t("460000")).toBe("৳4.6 L");
    expect(t("1200000")).toBe("৳12 L");
    expect(t("9996000")).toBe("৳1 Cr"); // ৳99.96 L → ৳1 Cr
    expect(t("10000000")).toBe("৳1 Cr");
    expect(t("12000000")).toBe("৳1.2 Cr");
    expect(t("1500000000")).toBe("৳150 Cr");
    expect(t("-460000")).toBe("-৳4.6 L");
    expect(t("-1250")).toBe("-৳1.3K"); // a negative rounds the same as a positive
    expect(t("-0.40")).toBe("৳0"); // no "-৳0"
    expect(() => compact(0.5)).toThrow();
  });

  it("U-CR-040.2 avgTaka: total ÷ n to whole taka, half away from zero; null when n ≤ 0", () => {
    expect(avgTaka(parse("3")!, 2)).toBe(parse("2")); // 1.50 → 2
    expect(avgTaka(parse("-3")!, 2)).toBe(parse("-2")); // a credit rounds the same way
    expect(avgTaka(parse("2.98")!, 2)).toBe(parse("1")); // 1.49 → 1
    expect(avgTaka(parse("-2.98")!, 2)).toBe(parse("-1"));
    expect(avgTaka(parse("100000")!, 3)).toBe(parse("33333"));
    expect(avgTaka(0, 5)).toBe(0);
    expect(Object.is(avgTaka(parse("-0.40")!, 1), -0)).toBe(false);
    expect(avgTaka(parse("100")!, 0)).toBeNull();
    expect(() => avgTaka(0.5, 2)).toThrow();
  });
});
