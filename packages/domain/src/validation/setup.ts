// Setup rows (UIDD §4.11; columns per SRS §4 Setup). Uniqueness, Walk-in being read-only and
// deactivate-instead-of-delete need the database, so the action checks those. The partners'
// total isn't checked on save; Setup only warns (D-023).
import { z } from "zod";
import { CARD_NETWORK_VALUES, PERSON_KIND_VALUES } from "../enums";
import { date, int, money, month, name, optional, optionalText, pick, rowId } from "./fields";

/** A profit share % like 50 or 33.333: 0–100, at most 3 decimals (numeric(6,3)). */
const percent = z.coerce
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,3})?$/, { error: "Enter a % like 50 or 33.333" })
  .transform(Number)
  .refine((n) => n <= 100, { error: "Can't be more than 100" });

/** Phone · WhatsApp · Email on people, customers and suppliers (D-039); all optional. */
const contacts = {
  phone: optionalText,
  whatsapp: optionalText,
  email: optional(z.email({ error: "Enter a valid email" })),
};

/** Partners have a profit share %; investors don't. */
export const personSchema = z
  .object({
    id: rowId,
    name: name("a name"),
    kind: z.enum(PERSON_KIND_VALUES, { error: "Choose Partner or Investor" }),
    profitSharePct: optional(percent),
    note: optionalText,
    ...contacts,
  })
  .transform((v, ctx) => {
    const partner = v.kind === "partner";
    if (partner && v.profitSharePct === null)
      ctx.addIssue({
        code: "custom",
        path: ["profitSharePct"],
        message: "Enter the profit share %",
      });
    return { ...v, profitSharePct: partner ? v.profitSharePct : null };
  });

export const cardSchema = z.object({
  id: rowId,
  name: name("the card name"),
  network: z.enum(CARD_NETWORK_VALUES, { error: "Choose the type" }).default("none"),
  ownerPersonId: pick("the owner"),
  statementDay: int(1, 31),
  dueDay: int(1, 31),
  creditLimit: optional(money()),
});

/** Only the proprietor's name is required; the shop name is filled in later (SRS §4). */
export const customerSchema = z.object({
  id: rowId,
  shopName: optionalText,
  proprietorName: name("the proprietor's name"),
  ...contacts,
  address: optionalText,
  targetBalance: optional(money()),
});

/** Deactivate or activate a row (UIDD §4.11). */
export const activeSchema = z.object({ id: rowId, active: z.boolean() });

export const supplierSchema = z.object({ id: rowId, name: name("a name"), ...contacts });

export const modelSchema = z.object({ id: rowId, name: name("the model name") });

/** One month's real statement or due date, when the bank moved it (overrides only, SRS §4). */
export const cardBillDateSchema = z
  .object({
    id: rowId,
    cardId: pick("a card"),
    billMonth: month,
    actualStatementDate: optional(date),
    actualDueDate: optional(date),
  })
  .refine((v) => v.actualStatementDate || v.actualDueDate, {
    path: ["actualStatementDate"],
    error: "Enter the statement date or the due date",
  });
