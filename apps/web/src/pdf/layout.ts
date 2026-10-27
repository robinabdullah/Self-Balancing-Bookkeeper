import { type BankAccountFields, bankFields, businessName, slug } from "@/lib/business";
import { dhakaToday, formatSaved } from "@/lib/dates";

// D-041: the parts every PDF shares, as plain text: the header (business details), the
// document's own terms (D-049) and "Generated …" line, the How to pay blocks and the file name.
// `document.tsx` lays them out; this file stays pure so tests can read what a PDF says.

export type PdfBusiness = {
  name: string;
  address: string | null;
  phones: string | null;
  email: string | null;
  tradeLicence: string | null;
  tin: string | null;
  bin: string | null;
  invoiceTerms: string | null;
  receiptTerms: string | null;
  statementTerms: string | null;
  footer: string | null;
  logo: string | null;
};

export type PdfFrame = {
  name: string;
  /** Address, phones, email and licence / TIN / BIN: only those filled in. */
  lines: string[];
  /** A PNG or JPEG data URL (the PDF can't draw WebP), else null. */
  logo: string | null;
  /** That document's terms, one per line: numbered under "Terms & conditions" (D-050). */
  terms: string[];
  /** The footer line's lines, centered below the terms. */
  footer: string[];
  generated: string;
  /** How to pay: one block of "Label: value" lines per picked account. */
  howToPay: [label: string, value: string][][];
};

/** D-049: the customer documents each print their own terms; an internal report prints none. */
export type PdfKind = "invoice" | "receipt" | "statement" | "report";

const TERMS = {
  invoice: "invoiceTerms",
  receipt: "receiptTerms",
  statement: "statementTerms",
} as const;

/** A multi-line box as its lines: each trimmed, blank ones dropped. */
const lines = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const filled = (parts: (string | false | null | undefined)[], sep: string) =>
  parts.filter((p): p is string => !!p && !!p.trim()).join(sep);

/** The header, footer and How to pay of a `kind` PDF made `now`. */
export function pdfFrame(
  b: PdfBusiness | null,
  kind: PdfKind,
  howToPay: BankAccountFields[],
  now: Date = new Date(),
): PdfFrame {
  const ids = filled(
    [
      b?.tradeLicence && `Trade licence: ${b.tradeLicence}`,
      b?.tin && `TIN: ${b.tin}`,
      b?.bin && `BIN: ${b.bin}`,
    ],
    " · ",
  );
  return {
    name: businessName(b),
    lines: [b?.address, filled([b?.phones && `Phone: ${b.phones}`, b?.email], " · "), ids].filter(
      (l): l is string => !!l && !!l.trim(),
    ),
    logo: /^data:image\/(png|jpeg);base64,/.test(b?.logo ?? "") ? b!.logo : null,
    terms: kind === "report" ? [] : lines(b?.[TERMS[kind]]),
    footer: kind === "report" ? [] : lines(b?.footer),
    generated: `Generated ${formatSaved(now.toISOString(), dhakaToday(now))}`,
    howToPay: howToPay.map(bankFields),
  };
}

/** "demo-business-shop-statement-rahman-telecom-2026-10-01-to-2026-10-31.pdf". */
export function pdfFileName(b: { name?: string | null } | null, ...parts: string[]) {
  return `${[businessName(b), ...parts].map(slug).filter(Boolean).join("-")}.pdf`;
}
