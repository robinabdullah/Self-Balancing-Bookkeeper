import { describe, expect, it } from "vitest";
import { bankOf, networkOf, typeWordIn } from "@mbl/domain/banks";
import { cardName, cardTitle } from "@mbl/domain/setup";

// CR-016.5 (D-036): a card's Type is its own column. Text reads "Owner · Name Type". The badge
// shows only the bank (D-053). Synthetic names.
describe("U-CR-016.5 card display + badge", () => {
  it("shows the Type after the name, never twice", () => {
    expect(cardName("EBL", "Arif", "visa")).toBe("Arif · EBL Visa");
    expect(cardName("Prime", "Arif", "mastercard")).toBe("Arif · Prime Mastercard");
    expect(cardName("City", "Nadim", "amex")).toBe("Nadim · City Amex");
    expect(cardName("EBL Visa", "Arif", "visa")).toBe("Arif · EBL Visa");
    expect(cardName("MTB Master", "Arif", "mastercard")).toBe("Arif · MTB Master");
    expect(cardName("Brac Visa", "Arif", "none")).toBe("Arif · Brac Visa");
    expect(cardName("Brac Visa", "Arif")).toBe("Arif · Brac Visa");
  });

  // U-CR-030.1 (D-053): the badge shows only the bank; the text beside it carries the Type.
  it("U-CR-030.1 the badge shows only the bank, never the Type", () => {
    expect(bankOf("EBL")).toEqual(bankOf("EBL Visa"));
    expect(bankOf("City Amex").short).toBe("City");
    expect(bankOf("EBL Visa")).not.toHaveProperty("network");
  });

  it("U-CR-030.1 the Cards table names a card with its Type, once", () => {
    expect(cardTitle("EBL", "visa")).toBe("EBL Visa");
    expect(cardTitle("City", "amex")).toBe("City Amex");
    expect(cardTitle("EBL Visa", "visa")).toBe("EBL Visa");
    expect(cardTitle("EBL", "none")).toBe("EBL");
    expect(cardTitle("EBL")).toBe("EBL");
  });

  it("finds the Type word in a name (for the Setup note)", () => {
    expect(typeWordIn("EBL Visa", "visa")).toBe("Visa");
    expect(typeWordIn("ebl visa", "visa")).toBe("visa");
    expect(typeWordIn("MTB Master", "mastercard")).toBe("Master");
    expect(typeWordIn("EBL Visa", "mastercard")).toBeNull();
    expect(typeWordIn("Visakhapatnam Bank", "visa")).toBeNull();
    expect(typeWordIn("EBL Visa", "none")).toBeNull();
  });

  it("takes the Type from a name: one network → it, both or neither → None", () => {
    expect(networkOf("Brac Visa")).toBe("visa");
    expect(networkOf("Prime Mastercard")).toBe("mastercard");
    expect(networkOf("MTB Master")).toBe("mastercard");
    expect(networkOf("Eastern Bank American Express")).toBe("amex");
    expect(networkOf("EBL visa/master")).toBe("none");
    expect(networkOf("Standard Chartered Platinum")).toBe("none");
  });
});
