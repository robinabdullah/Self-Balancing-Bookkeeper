// D-046 (UIDD §4.14): saved card details. Pure helpers for the masked and revealed views; the
// encryption is server-only (`src/server/card-crypto.ts`).

/** How long revealed details stay on screen; D-054: also how long one fingerprint lasts. */
export const REVEAL_SECONDS = 30;
/** Edit / Remove are allowed this long after your own reveal of that card (checked on the server). */
export const EDIT_AFTER_REVEAL_MINUTES = 10;

export const NO_KEY = "Card details aren't set up on this server";
/** D-054: a window reveal after the 30 s are up (the client then asks for the fingerprint). */
export const USE_FINGERPRINT = "Use your fingerprint";
export const ONE_PRIMARY = "This card already has a primary — mark this one Supplementary";
/** D-067: followed by the card that already holds the number ("… Arif · EBL Visa"). */
export const DUPLICATE_NUMBER = "This number is already saved on";
export const REVEAL_FIRST = "Reveal the details first, then edit them";
/** D-052: reveal needs the fingerprint; there is no password reveal. */
export const NO_FINGERPRINT = "Set up fingerprint unlock to see card details";
export const FINGERPRINT_FAILED = "Fingerprint not accepted — try again";

export type CardDetails = {
  holder: string | null;
  number: string;
  expiry: string | null;
  cvv: string | null;
};

/** Spaces and dashes dropped: "4242 4242-4242 4242" → "4242424242424242". */
export const normaliseNumber = (text: string) => text.replace(/[\s-]/g, "");

/** The card check digit (Luhn). */
export function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/** "4242424242424242" → "4242 4242 4242 4242". */
export const groupNumber = (digits: string) => digits.replace(/(\d{4})(?=\d)/g, "$1 ");

/** D-067: the number box as it's typed: digits only (at most 19), grouped in fours. */
export const typedNumber = (text: string) => groupNumber(text.replace(/\D/g, "").slice(0, 19));

/** D-067: an "MM/YY" expiry before `today`'s month → its month ("2026-09"); else null. */
export function expiredBefore(expiry: string | null, today: string): string | null {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry ?? "");
  const month = m && `20${m[2]}-${m[1]}`;
  return month && month < today.slice(0, 7) ? month : null;
}

/** D-054: a saved number is the card's primary or a supplementary card on the same bill. */
export const CARD_TAGS = ["primary", "supplementary"] as const;
export type CardTag = (typeof CARD_TAGS)[number];
export const TAG_LABEL: Record<CardTag, string> = {
  primary: "Primary",
  supplementary: "Supplementary",
};
export const tagOf = (supplementary: boolean): CardTag =>
  supplementary ? "supplementary" : "primary";

/** D-051: hidden, a card shows only its last 4 digits. */
export const maskedLine = (last4: string) => `•••• •••• •••• ${last4}`;

/** The revealed fields: [label, shown, copied]. The number is copied without spaces. */
export function cardDetailFields(d: CardDetails): [label: string, shown: string, copy: string][] {
  const rows: [string, string, string][] = [
    ["Cardholder", d.holder ?? "", d.holder ?? ""],
    ["Card number", groupNumber(d.number), d.number],
    ["Expiry", d.expiry ?? "", d.expiry ?? ""],
    ["CVV", d.cvv ?? "", d.cvv ?? ""],
  ];
  return rows.filter(([, shown]) => shown !== "");
}

/** Copy all: one "Label: value" line per field. */
export const cardDetailsText = (d: CardDetails) =>
  cardDetailFields(d)
    .map(([label, , copy]) => `${label}: ${copy}`)
    .join("\n");

/** A passkey's device name, from the browser that set it up. */
export function deviceName(userAgent: string | null) {
  const ua = userAgent ?? "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Windows/.test(ua)) return "Windows computer";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux|CrOS/.test(ua)) return "Linux computer";
  return "This device";
}
