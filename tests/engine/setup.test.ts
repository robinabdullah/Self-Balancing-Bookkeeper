import { describe, expect, it } from "vitest";
import { cardName, customerName, partnerWarning } from "@mbl/domain/setup";

// Task 3.2 display rules and the partners' total warning (SRS §4; D-022, D-023).
const partner = (pct: string, active = true) => ({ kind: "partner", active, profitSharePct: pct });

describe("setup display rules (task 3.2)", () => {
  it("3.2 the partners' total warns until the active partners total exactly 100", () => {
    expect(partnerWarning([partner("50.000"), partner("50.000")])).toBeNull();
    expect(partnerWarning([partner("33.333"), partner("33.333"), partner("33.334")])).toBeNull();
    expect(partnerWarning([partner("60"), partner("50")])).toBe(
      "Partners total 110% — must be 100 before closing",
    );
    expect(partnerWarning([partner("33.333"), partner("33.333")])).toBe(
      "Partners total 66.666% — must be 100 before closing",
    );
    // Investors and inactive partners don't count; no partners at all → 0%.
    expect(
      partnerWarning([
        partner("100"),
        partner("50", false),
        { kind: "investor", active: true, profitSharePct: null },
      ]),
    ).toBeNull();
    expect(partnerWarning([])).toBe("Partners total 0% — must be 100 before closing");
  });

  it("3.2 a customer shows as Shop (Proprietor); a card as Owner · Card", () => {
    expect(customerName({ shopName: "Milon Telecom", proprietorName: "Milon" })).toBe(
      "Milon Telecom (Milon)",
    );
    expect(customerName({ shopName: null, proprietorName: "Selim" })).toBe("Selim");
    expect(cardName("Brac Visa", "Arif")).toBe("Arif · Brac Visa");
  });
});
