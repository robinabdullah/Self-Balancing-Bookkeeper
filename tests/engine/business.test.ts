import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATES,
  FALLBACK_NAME,
  MESSAGE_LABEL,
  MESSAGE_TYPES,
  appName,
  bankAccountText,
  bankFields,
  businessName,
  exportFileName,
  fillTemplate,
  firstPhone,
  template,
} from "@/lib/business";
import { bankAccountSchema, logoSchema, templateSchema } from "@/lib/validation/business";

// CR-019 (D-039; UIDD §4.13, §4.14): message templates, the business name and saved bank accounts.

const ID = "00000000-0000-4000-8000-000000000001";
const OWNER = "00000000-0000-4000-8000-000000000002";

describe("U-CR-019.1 templates, app name, export file name", () => {
  it("8 message types, each with a label and a default", () => {
    expect(MESSAGE_TYPES.map((t) => MESSAGE_LABEL[t])).toEqual([
      "Sale",
      "Payment in",
      "Return",
      "Discount",
      "Profit share",
      "Due reminder",
      "Statement",
      "Investor report",
    ]);
    for (const t of MESSAGE_TYPES)
      expect(DEFAULT_TEMPLATES[t].greeting).toBe("Assalamu alaikum {name} bhai,");
    expect(DEFAULT_TEMPLATES.sale.signOff).toBe("Thank you! — {shop} · {phone}");
    expect(DEFAULT_TEMPLATES.payment.signOff).toBe("Thank you! — {shop} · {phone}");
    expect(DEFAULT_TEMPLATES.reminder.signOff).toBe("— {shop}");
  });

  it("a saved template (even empty) replaces the default; other types keep theirs", () => {
    const saved = { reminder: { greeting: "Dear {name},", signOff: "" } };
    expect(template(saved, "reminder")).toEqual({ greeting: "Dear {name},", signOff: "" });
    expect(template(saved, "sale")).toEqual(DEFAULT_TEMPLATES.sale);
    expect(template({}, "sale")).toEqual(DEFAULT_TEMPLATES.sale);
    expect(template(null, "statement")).toEqual(DEFAULT_TEMPLATES.statement);
  });

  it("fills {name}, {shop}, {phone}; a missing name or phone drops cleanly", () => {
    const shop = "Demo Business Shop";
    expect(fillTemplate("Assalamu alaikum {name} bhai,", { name: "Karim" })).toBe(
      "Assalamu alaikum Karim bhai,",
    );
    expect(fillTemplate("Assalamu alaikum {name} bhai,", { name: "" })).toBe("Assalamu alaikum,");
    expect(fillTemplate("Dear {name},", { name: null })).toBe("Dear,");
    expect(fillTemplate("Thank you! — {shop} · {phone}", { shop, phone: "01700000001" })).toBe(
      "Thank you! — Demo Business Shop · 01700000001",
    );
    expect(fillTemplate("Thank you! — {shop} · {phone}", { shop, phone: null })).toBe(
      "Thank you! — Demo Business Shop",
    );
  });

  it("the top bar uses the short name, else the name, else the app's own", () => {
    expect(appName({ name: "Demo Business Shop", shortName: "Demo" })).toBe("Demo");
    expect(appName({ name: "Demo Business Shop", shortName: " " })).toBe(
      "Demo Business Shop",
    );
    expect(appName(null)).toBe(FALLBACK_NAME);
    expect(businessName({ name: "Demo Business Shop", shortName: "Demo" })).toBe(
      "Demo Business Shop",
    );
    expect(businessName(undefined)).toBe("Mobile Business Lite");
  });

  it("the export file is named after the business", () => {
    expect(exportFileName({ name: "Demo Business Shop" }, "2026-10-10")).toBe(
      "demo-business-shop-2026-10-10.xlsx",
    );
    expect(exportFileName({ name: "S&M (Dhaka) Ltd." }, "2026-10-10")).toBe(
      "s-m-dhaka-ltd-2026-10-10.xlsx",
    );
    expect(exportFileName(null, "2026-10-10")).toBe("mobile-business-lite-2026-10-10.xlsx");
  });

  it("the first of several phones", () => {
    expect(firstPhone("01700000001, 01800000001")).toBe("01700000001");
    expect(firstPhone(null)).toBeNull();
  });

  it("template and logo validation", () => {
    expect(
      templateSchema.safeParse({ id: ID, type: "sale", greeting: " Hi ", signOff: "" }).data,
    ).toEqual({ id: ID, type: "sale", greeting: "Hi", signOff: "" });
    expect(templateSchema.safeParse({ id: ID, type: "cash_book", greeting: "" }).success).toBe(
      false,
    );
    expect(
      templateSchema.safeParse({ id: ID, type: "sale", greeting: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      logoSchema.safeParse({ id: ID, logo: "data:image/png;base64,iVBORw0KGgo=" }).success,
    ).toBe(true);
    expect(logoSchema.safeParse({ id: ID, logo: "" }).data).toEqual({ id: ID, logo: null });
    expect(logoSchema.safeParse({ id: ID, logo: "https://x/logo.png" }).success).toBe(false);
    expect(
      logoSchema.safeParse({ id: ID, logo: "data:image/svg+xml;base64,PHN2Zz4=" }).success,
    ).toBe(false);
  });
});

describe("U-CR-019.2 bank account text and validation", () => {
  const account = {
    bankName: "EBL",
    branch: "Gulshan",
    accountName: "Demo Business Shop",
    accountNumber: "1234567890",
    routingNumber: "095261234",
  };

  it("Copy all / Share: one line per field, no note", () => {
    expect(bankAccountText({ ...account, note: "personal" } as typeof account)).toBe(
      [
        "Bank: EBL",
        "Branch: Gulshan",
        "Account name: Demo Business Shop",
        "Account number: 1234567890",
        "Routing number: 095261234",
      ].join("\n"),
    );
  });

  it("empty fields are left out", () => {
    expect(bankFields({ ...account, branch: null, routingNumber: null }).map(([l]) => l)).toEqual([
      "Bank",
      "Account name",
      "Account number",
    ]);
  });

  it("routing is 9 digits; an owner other than the business must be picked", () => {
    const base = { id: ID, bankName: "EBL", accountName: "A", accountNumber: "1" };
    expect(bankAccountSchema.safeParse(base).data).toMatchObject({
      ownerKind: "business",
      ownerId: null,
      branch: null,
      routingNumber: null,
      note: "",
    });
    expect(bankAccountSchema.safeParse({ ...base, routingNumber: "12345678" }).success).toBe(false);
    expect(bankAccountSchema.safeParse({ ...base, routingNumber: "123456789" }).success).toBe(true);
    const noOwner = bankAccountSchema.safeParse({ ...base, ownerKind: "customer", ownerId: "" });
    expect(noOwner.error?.issues[0].path).toEqual(["ownerId"]);
    expect(
      bankAccountSchema.safeParse({ ...base, ownerKind: "customer", ownerId: OWNER }).success,
    ).toBe(true);
    expect(bankAccountSchema.safeParse({ ...base, accountNumber: " " }).success).toBe(false);
  });
});
