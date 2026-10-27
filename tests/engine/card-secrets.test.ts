import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  NO_KEY,
  TAG_LABEL,
  cardDetailFields,
  cardDetailsText,
  deviceName,
  expiredBefore,
  groupNumber,
  luhn,
  maskedLine,
  tagOf,
  typedNumber,
} from "@/lib/card-secrets";
import { cardDetailsSchema } from "@/lib/validation/card-secrets";
import {
  cardKey,
  decryptField,
  encryptField,
  revealWindowOf,
  revealWindowOpen,
  signRevealWindow,
} from "@/server/card-crypto";

// CR-026 (D-046): card details are AES-256-GCM ciphertext bound to their card; the form's checks
// and the masked / revealed views. Synthetic test numbers only.
const KEY = randomBytes(32);
const CARD = randomUUID();
const NUMBER = "4242424242424242"; // a public test number

describe("U-CR-026.1 card crypto (AES-256-GCM, card id as extra data)", () => {
  it("round-trips a value, with a fresh IV each time", () => {
    const a = encryptField(NUMBER, CARD, KEY);
    const b = encryptField(NUMBER, CARD, KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain(NUMBER);
    expect(a.startsWith("v1.")).toBe(true);
    expect(decryptField(a, CARD, KEY)).toBe(NUMBER);
    expect(decryptField(encryptField("", CARD, KEY), CARD, KEY)).toBe("");
  });

  const fails = (fn: () => unknown) => {
    let message = "";
    try {
      fn();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/can't be read/);
    expect(message).not.toContain(NUMBER);
  };

  it("fails with a wrong key, a tampered value, or another card", () => {
    const sealed = encryptField(NUMBER, CARD, KEY);
    fails(() => decryptField(sealed, CARD, randomBytes(32)));
    fails(() => decryptField(sealed, randomUUID(), KEY));
    const [v, iv, tag, data] = sealed.split(".");
    const flip = (part: string) => {
      const bytes = Buffer.from(part, "base64url");
      bytes[0] ^= 1;
      return bytes.toString("base64url");
    };
    fails(() => decryptField([v, flip(iv), tag, data].join("."), CARD, KEY));
    fails(() => decryptField([v, iv, flip(tag), data].join("."), CARD, KEY));
    fails(() => decryptField([v, iv, tag, flip(data)].join("."), CARD, KEY));
    fails(() => decryptField("not-a-value", CARD, KEY));
  });

  it("refuses a missing or short key", () => {
    expect(() => cardKey(undefined)).toThrow(NO_KEY);
    expect(() => cardKey("")).toThrow(NO_KEY);
    expect(() => cardKey(randomBytes(16).toString("base64"))).toThrow(NO_KEY);
    expect(cardKey(KEY.toString("base64"))).toEqual(KEY);
  });
});

describe("U-CR-026.2 card details: checks, mask and copy text", () => {
  const parse = (v: Record<string, string>) =>
    cardDetailsSchema.safeParse({ id: randomUUID(), cardId: CARD, number: NUMBER, ...v });
  const error = (v: Record<string, string>) => {
    const r = parse(v);
    return r.success ? null : r.error.issues[0].message;
  };

  it("normalises the number and checks its digits", () => {
    expect(luhn(NUMBER)).toBe(true);
    expect(luhn("4242424242424241")).toBe(false);
    const r = parse({ number: "4242 4242-4242 4242" });
    expect(r.success && r.data.number).toBe(NUMBER);
    expect(error({ number: "" })).toBe("Enter the card number");
    expect(error({ number: "42424242" })).toBe("A card number has 12 to 19 digits");
    expect(error({ number: "4242 4242 4242 4241" })).toMatch(/doesn't look right/);
    expect(parse({ number: "378282246310005" }).success).toBe(true); // Amex, 15 digits
  });

  it("checks expiry (MM/YY), CVV (3–4 digits) and the cardholder (≤ 60)", () => {
    const r = parse({ expiry: "0927", cvv: "123", holder: " Arif " });
    expect(r.success && r.data).toMatchObject({ expiry: "09/27", cvv: "123", holder: "Arif" });
    expect(parse({ expiry: "", cvv: "", holder: "" }).data).toMatchObject({
      expiry: null,
      cvv: null,
      holder: null,
    });
    expect(error({ expiry: "13/27" })).toBe("Enter the expiry as MM/YY");
    expect(error({ cvv: "12" })).toBe("A CVV has 3 or 4 digits");
    expect(parse({ cvv: "1234" }).success).toBe(true);
    expect(error({ holder: "x".repeat(61) })).toBe("At most 60 characters");
  });

  it("D-051 hidden, a card shows only its last 4 digits (no expiry or CVV placeholders)", () => {
    expect(maskedLine("4444")).toBe("•••• •••• •••• 4444");
    expect(maskedLine("0005")).toBe("•••• •••• •••• 0005"); // Amex too
  });

  it("shows the number grouped and copies it without spaces", () => {
    const d = { holder: "Arif", number: NUMBER, expiry: "09/27", cvv: "123" };
    expect(groupNumber(NUMBER)).toBe("4242 4242 4242 4242");
    expect(cardDetailFields(d)).toEqual([
      ["Cardholder", "Arif", "Arif"],
      ["Card number", "4242 4242 4242 4242", NUMBER],
      ["Expiry", "09/27", "09/27"],
      ["CVV", "123", "123"],
    ]);
    expect(cardDetailsText({ ...d, holder: null, cvv: null })).toBe(
      `Card number: ${NUMBER}\nExpiry: 09/27`,
    );
  });

  it("names the device from its browser", () => {
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129")).toBe("Android phone");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows computer");
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("Mac");
    expect(deviceName(null)).toBe("This device");
  });
});

describe("U-CR-031.1 the reveal window (D-054): signed, this user's, fixed end", () => {
  const USER = randomUUID();
  const NOW = 1_800_000_000_000;
  const token = signRevealWindow(USER, NOW + 30_000, KEY);

  it("is open until its end, for its own user only", () => {
    expect(token).not.toContain(KEY.toString("base64"));
    expect(revealWindowOpen(token, USER, NOW, KEY)).toBe(true);
    expect(revealWindowOpen(token, USER, NOW + 29_999, KEY)).toBe(true);
    expect(revealWindowOpen(token, USER, NOW + 30_000, KEY)).toBe(false); // over
    expect(revealWindowOpen(token, randomUUID(), NOW, KEY)).toBe(false); // another user
  });

  it("refuses a moved end, another key, or junk", () => {
    const [user, until, mac] = token.split(".");
    const later = `${user}.${Number(until) + 60_000}.${mac}`;
    expect(revealWindowOpen(later, USER, NOW + 40_000, KEY)).toBe(false);
    expect(revealWindowOpen(token, USER, NOW, randomBytes(32))).toBe(false);
    for (const junk of [undefined, "", "a.b", `${user}.${until}.`, `${user}.${until}.xx`])
      expect(revealWindowOpen(junk, USER, NOW, KEY)).toBe(false);
  });

  it("reads its cookie from the Cookie header", () => {
    expect(revealWindowOf(`theme=dark; card_reveal=${token}; other=1`)).toBe(token);
    expect(revealWindowOf("theme=dark")).toBeUndefined();
    expect(revealWindowOf(null)).toBeUndefined();
  });
});

describe("U-CR-031.2 a saved number is tagged Primary or Supplementary (D-054)", () => {
  it("labels the tag; the form's tag defaults to Primary", () => {
    expect(TAG_LABEL[tagOf(false)]).toBe("Primary");
    expect(TAG_LABEL[tagOf(true)]).toBe("Supplementary");
    const parse = (v: object) =>
      cardDetailsSchema.parse({ id: randomUUID(), cardId: CARD, number: NUMBER, ...v });
    expect(parse({}).tag).toBe("primary");
    expect(parse({ tag: "supplementary" }).tag).toBe("supplementary");
    expect(() => parse({ tag: "other" })).toThrow("Choose Primary or Supplementary");
  });
});

describe("CR-045 the card form formats as you type (D-067)", () => {
  it("U-CR-045.2 typedNumber groups the digits in fours, at most 19", () => {
    expect(typedNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(typedNumber("4242-4242 42a")).toBe("4242 4242 42");
    expect(typedNumber("1234567890123456789012")).toBe("1234 5678 9012 3456 789");
    expect(typedNumber("")).toBe("");
  });

  it("U-CR-045.3 expiredBefore gives the month of an expiry before this month", () => {
    expect(expiredBefore("09/26", "2026-10-24")).toBe("2026-09");
    expect(expiredBefore("12/25", "2026-01-01")).toBe("2025-12");
    expect(expiredBefore("10/26", "2026-10-24")).toBeNull(); // this month still works
    expect(expiredBefore("01/27", "2026-10-24")).toBeNull();
    for (const text of ["", null, "13/26", "0926", "09/2"])
      expect(expiredBefore(text, "2026-10-24")).toBeNull();
  });
});
