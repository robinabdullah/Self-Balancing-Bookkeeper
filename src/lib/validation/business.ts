// D-039: Settings → Business (Details · Logo · Messages · PDF terms, D-049) and the saved bank
// accounts. The business row's id comes with each save, plus the `updatedAt` the form saw (D-010).
import { z } from "zod";
import { MESSAGE_TYPES } from "@/lib/business";
import { name, optional, optionalText, rowId } from "@/lib/validation/fields";

export const businessDetailsSchema = z.object({
  id: rowId,
  name: name("the business name"),
  shortName: optionalText,
  address: optionalText,
  phones: optionalText,
  whatsapp: optionalText,
  email: optional(z.email({ error: "Enter a valid email" })),
  tradeLicence: optionalText,
  tin: optionalText,
  bin: optionalText,
});

/** D-049: each box is multi-line, at most 1,000 characters. */
export const TERMS_MAX = 1000;

const termsText = optional(
  z.string().trim().max(TERMS_MAX, { error: "At most 1,000 characters" }),
).transform((s) => s || null);

/** Each document's own terms and the footer line (leaving Details, so saving it can't clear them). */
export const pdfTermsSchema = z.object({
  id: rowId,
  invoiceTerms: termsText,
  receiptTerms: termsText,
  statementTerms: termsText,
  footer: termsText,
});

/** ~150 KB: a 256 px PNG is far smaller; anything bigger wasn't resized. */
export const LOGO_MAX = 200_000;

/** The browser resizes the image; "" removes the logo. */
export const logoSchema = z.object({
  id: rowId,
  logo: optional(
    z
      .string()
      .max(LOGO_MAX, { error: "The image is too large" })
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, {
        error: "Choose a PNG, JPEG or WebP image",
      }),
  ),
});

const templateText = z.string().trim().max(200, { error: "At most 200 characters" }).default("");

export const templateSchema = z.object({
  id: rowId,
  type: z.enum(MESSAGE_TYPES, { error: "Unknown message type" }),
  greeting: templateText,
  signOff: templateText,
});

export const OWNER_KINDS = ["business", "person", "customer", "supplier"] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];

/** The owner: the business (no id) or one person / customer / supplier (pick, don't type). */
export const bankAccountSchema = z
  .object({
    id: rowId,
    ownerKind: z.enum(OWNER_KINDS, { error: "Choose the owner" }).default("business"),
    ownerId: optional(z.uuid({ error: "Pick the owner" })),
    bankName: name("the bank name"),
    branch: optionalText,
    accountName: name("the account name"),
    accountNumber: name("the account number"),
    routingNumber: optional(
      z
        .string()
        .trim()
        .regex(/^\d{9}$/, { error: "A routing number has 9 digits" }),
    ),
    note: z.string().trim().default(""),
  })
  .refine((v) => v.ownerKind === "business" || v.ownerId, {
    path: ["ownerId"],
    error: "Pick the owner",
  });

export type BankAccountInput = z.infer<typeof bankAccountSchema>;
