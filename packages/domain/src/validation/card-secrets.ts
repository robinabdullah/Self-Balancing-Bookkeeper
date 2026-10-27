// D-046 (UIDD §4.14): a card's saved details (D-054: one of its numbers). Only the number is required; it must pass the card
// check digit. The card is picked (pick, don't type); `id` is the details row's own id.
import { z } from "zod";
import { CARD_TAGS, luhn, normaliseNumber } from "../card-secrets";
import { optional, pick, rowId } from "./fields";

export const cardDetailsSchema = z.object({
  id: rowId,
  cardId: pick("the card"),
  // D-054: the card's primary or a supplementary card on the same bill.
  tag: z.enum(CARD_TAGS, { error: "Choose Primary or Supplementary" }).default("primary"),
  holder: optional(z.string().trim().max(60, { error: "At most 60 characters" })).transform(
    (s) => s || null,
  ),
  number: z
    .string({ error: "Enter the card number" })
    .transform(normaliseNumber)
    .pipe(
      z
        .string()
        .min(1, { error: "Enter the card number" })
        .regex(/^\d{12,19}$/, { error: "A card number has 12 to 19 digits" })
        .refine(luhn, { error: "This number doesn't look right — check the digits" }),
    ),
  expiry: optional(
    z
      .string()
      .trim()
      .regex(/^(0[1-9]|1[0-2])\s*\/?\s*\d{2}$/, { error: "Enter the expiry as MM/YY" })
      .transform((s) => `${s.slice(0, 2)}/${s.slice(-2)}`),
  ),
  cvv: optional(
    z
      .string()
      .trim()
      .regex(/^\d{3,4}$/, { error: "A CVV has 3 or 4 digits" }),
  ),
});

export type CardDetailsInput = z.infer<typeof cardDetailsSchema>;
