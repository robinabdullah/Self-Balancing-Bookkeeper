import { describe, expect, it } from "vitest";
import { DARK, NEUTRAL, WHITE, allBadges, bankOf, contrast, middle } from "@/lib/banks";

// CR-013 (D-032): the bank badge comes from the card name. Synthetic names; the bank names are
// the ones the partners use (SRS §6 fixture table).
describe("U-CR-013.2 bank badge", () => {
  it.each([
    ["Southeast Visa", "SEBL"],
    ["Brac Visa", "BRAC"],
    ["EBL Visa", "EBL"],
    ["MTB Visa", "MTB"],
    ["UCB Visa", "UCB"],
    ["City Amex", "City"],
    ["City Visa", "City"],
    ["SCB Visa", "SCB"],
    ["Prime Mastercard", "Prime"],
    ["Standard Chartered Platinum", "SCB"],
    ["Mutual Trust Bank Master", "MTB"],
    ["Eastern Bank American Express", "EBL"],
    ["Dutch-Bangla Visa", "DBBL"],
  ])("%s → %s", (name, short) => {
    expect(bankOf(name).short).toBe(short);
  });

  it("ignores case and extra spaces", () => {
    expect(bankOf("  ebl   VISA ").short).toBe("EBL");
  });

  it("does not take Southeast for Eastern, or Mutual Trust for Trust Bank", () => {
    expect(bankOf("Southeast Visa").short).toBe("SEBL");
    expect(bankOf("Mutual Trust Visa").short).toBe("MTB");
    expect(bankOf("Trust Bank Visa").short).toBe("TBL");
  });

  it("an unknown bank gets its initials on the neutral colour", () => {
    expect(bankOf("Foo Bank Visa")).toMatchObject({
      short: "FB",
      background: NEUTRAL,
      text: WHITE,
    });
    expect(bankOf("Visa")).toMatchObject({ short: "?", background: NEUTRAL });
  });

  // D-033: the current banks follow their logos (the partners chose these, 2026-10-09).
  it("the current banks wear their logo colours", () => {
    expect(bankOf("EBL Visa")).toMatchObject({ background: "#ffc10e", text: DARK }); // EBL yellow
    expect(bankOf("City Visa").background).toBe("#c8102e");
    expect(bankOf("UCB Visa").background).toBe("#d01920");
    expect(bankOf("Brac Visa").background).toBe("#006cb6");
    // Southeast: a blue S and a magenta B, as two hard-edged halves.
    expect(bankOf("Southeast Visa").background).toBe(
      "linear-gradient(120deg, #0088cc 0% 50%, #b72c91 50% 100%)",
    );
    // MTB's 2025 logo is a smooth pink → purple → teal → green gradient.
    expect(bankOf("MTB Visa").background).toBe(
      "linear-gradient(120deg, #e8185e, #8b3a9c, #12a1a4, #3dbe6e)",
    );
    // Prime: red, green and blue, like the three arms of its triangle.
    expect(bankOf("Prime Visa").stops).toEqual(["#b31217", "#156535", "#2e4fa3"]);
    expect(bankOf("Prime Visa").background).toMatch(/^linear-gradient\(120deg, #b31217 0% /);
  });

  it("the text reads well where it sits: ≥ 4.5:1 on one colour, ≥ 3:1 on a multi-colour logo", () => {
    for (const b of allBadges()) {
      const worst = Math.min(...middle(b.stops).map((s) => contrast(b.text, s)));
      // A badge is a logo (WCAG 1.4.3 exempts logotypes); still keep its short name readable.
      expect(worst, `${b.short} on ${b.stops.join(" ")}`).toBeGreaterThanOrEqual(
        b.stops.length > 1 ? 3 : 4.5,
      );
    }
  });
});

// D-035: the opening's other banks, from their logos.
describe("U-CR-015.3 more bank badges", () => {
  it.each([
    ["Meghna Visa", "MBL"],
    ["Bank Asia Mastercard", "BA"],
    ["LankaBangla Visa", "LBF"],
    ["Lanka Bangla Amex", "LBF"],
  ])("%s → %s", (name, short) => {
    expect(bankOf(name).short).toBe(short);
  });

  it("wear their logo colours", () => {
    expect(bankOf("Meghna Visa")).toMatchObject({ background: "#62259a", text: WHITE });
    expect(bankOf("Bank Asia Visa")).toMatchObject({ background: "#1f5fb0", text: WHITE });
    // LankaBangla: green with an orange stripe, white text over the green, like SCB's split.
    expect(bankOf("LankaBangla Visa")).toMatchObject({
      stops: ["#0b8a45", "#0b8a45", "#f7941d"],
      text: WHITE,
    });
    expect(allBadges().map((b) => b.short)).toEqual(expect.arrayContaining(["MBL", "BA", "LBF"]));
  });
});
