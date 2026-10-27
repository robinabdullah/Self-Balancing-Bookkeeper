// Shared Zod fields for the entry and setup forms (SRS §3–§4). The input is what the form holds
// (text for money, "" for an empty picker); the output is what the action stores: integer poisha,
// "YYYY-MM-DD" dates, "YYYY-MM" months and null for an empty optional field.
import { z } from "zod";
import { parse } from "../money";

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** An optional field: "" or missing → null. */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToNull, schema.nullable());

/**
 * FormData's flat names ("lines.0.qty") → nested objects and arrays, as the schemas expect; Zod's
 * error paths join back to the same names. Input that is already nested passes through.
 */
export function nest(fields: unknown): unknown {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return fields;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    const path = key.split(".");
    let node = out;
    path.slice(0, -1).forEach((k, i) => {
      node = (node[k] ??= /^\d+$/.test(path[i + 1]) ? [] : {}) as Record<string, unknown>;
    });
    node[path[path.length - 1]] = value;
  }
  return out;
}

/** A client-generated row id (SRS §3). */
export const rowId = z.uuid({ error: "Missing id — reload the form" });

/** A required picker (pick, don't type): "Pick a customer". */
export const pick = (what: string) => z.uuid({ error: `Pick ${what}` });

export const optionalPick = optional(z.uuid({ error: "Pick from the list" }));

export const date = z.iso.date({ error: "Enter a date" });

export const month = z
  .string({ error: "Pick a month" })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: "Pick a month" });

/** Trimmed free text (a note): missing → "". */
export const note = z.string().trim().default("");

/** Optional free text (phone, address …): blank → null. */
export const optionalText = optional(z.string().trim()).transform((s) => s || null);

/** Required free text (a name). */
export const name = (what: string) =>
  z
    .string({ error: `Enter ${what}` })
    .trim()
    .min(1, { error: `Enter ${what}` });

/** `any`: signed, 0 allowed (an opening balance, SRS §9). */
type Sign = "positive" | "nonNegative" | "nonZero" | "any";

/** Money typed as text ("33,720", "17,444.80") → integer poisha; never rounds (SRS §3). */
export const money = (sign: Sign = "positive") =>
  z.string({ error: "Enter an amount" }).transform((text, ctx) => {
    const poisha = parse(text);
    const fail = (message: string) => {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    };
    if (text.trim() === "") return fail("Enter an amount");
    if (poisha === null) return fail("Enter an amount like 33,720 or 17,444.80");
    if (sign === "positive" && poisha <= 0) return fail("Amount must be more than 0");
    if (sign === "nonNegative" && poisha < 0) return fail("Amount can't be negative");
    if (sign === "nonZero" && poisha === 0) return fail("Amount can't be 0");
    return poisha;
  });

/** A whole number typed as text or a number, from `min` to `max`. */
export const int = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number({ error: "Enter a whole number" })
    .int({ error: "Enter a whole number" })
    .min(min, { error: `Must be at least ${min}` })
    .max(max, { error: `Must be at most ${max}` });

/** UIDD §4.6 expense chips; stored as text in `money_entries.category`. */
export const EXPENSE_CATEGORIES = [
  "salary",
  "delivery",
  "pos_qr",
  "rent",
  "internet",
  "other",
] as const;

/** The chips' labels (the expense form, the close screen's breakdown). */
export const EXPENSE_LABELS: Record<(typeof EXPENSE_CATEGORIES)[number], string> = {
  salary: "Salary",
  delivery: "Delivery",
  pos_qr: "POS/QR",
  rent: "Rent",
  internet: "Internet",
  other: "Other",
};

/** A card fee's fixed category (SRS §4). */
export const CARD_FEE_CATEGORY = "card fee/interest";
