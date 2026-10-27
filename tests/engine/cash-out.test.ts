import { describe, expect, it } from "vitest";
import { BAD_RATE, feePct, receivedAt } from "@/lib/cash-out";
import { parse, sub } from "@/lib/money";

// CR-033 (D-056; UIDD §4.6): the Cash-out form's Fee % fills Cash received, exact to the paisa.

describe("U-CR-033.2 cash-out: Fee % → Cash received, and the fee as a %", () => {
  it("charged − the %, exact to the paisa", () => {
    expect(receivedAt("280000", "1.3")).toEqual({ received: parse("276360") });
    expect(receivedAt("2,80,000", "1.15")).toEqual({ received: parse("276780") });
    const r = receivedAt("123457", "1.15").received!;
    expect(sub(parse("123457")!, r)).toBe(parse("1419.76")); // 1,419.7555 → half-up
    expect(r).toBe(parse("122037.24"));
    expect(receivedAt("1000", "0")).toEqual({ received: parse("1000") });
    expect(receivedAt("1000", "100")).toEqual({ received: 0 });
  });

  it("nothing to fill until Charged reads; a bad % says so", () => {
    expect(receivedAt("", "1.3")).toEqual({ received: null });
    expect(receivedAt("abc", "1.3")).toEqual({ received: null });
    for (const bad of ["1.2345", "-1", "101", "1,3", "x"])
      expect(receivedAt("1000", bad)).toEqual({ received: null, error: BAD_RATE });
  });

  it("the fee line's %: half-up to at most 2 decimals; none without a charge", () => {
    expect(feePct(parse("3640")!, parse("280000")!)).toBe("1.3");
    expect(feePct(parse("1419.76")!, parse("123457")!)).toBe("1.15");
    expect(feePct(parse("1500")!, parse("100000")!)).toBe("1.5");
    expect(feePct(0, parse("1000")!)).toBe("0");
    expect(feePct(parse("1")!, parse("300")!)).toBe("0.33");
    expect(feePct(parse("2")!, parse("300")!)).toBe("0.67");
    expect(feePct(0, 0)).toBeNull();
  });
});
