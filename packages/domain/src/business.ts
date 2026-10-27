// D-039: the business profile's pure parts: the message templates (greeting + sign-off per type,
// with defaults until one is saved), the app name, the export file name and the bank-account text
// that Copy all and Share use.

export const MESSAGE_TYPES = [
  "sale",
  "payment",
  "return",
  "discount",
  "profit_share",
  "reminder",
  "statement",
  "investor",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_LABEL: Record<MessageType, string> = {
  sale: "Sale",
  payment: "Payment in",
  return: "Return",
  discount: "Discount",
  profit_share: "Profit share",
  reminder: "Due reminder",
  statement: "Statement",
  investor: "Investor report",
};

export type Template = { greeting: string; signOff: string };
export type Templates = Partial<Record<MessageType, Template>>;

const GREETING = "Assalamu alaikum {name} bhai,";
const THANKS = "Thank you! — {shop} · {phone}";

/** What a type uses until it is saved. */
export const DEFAULT_TEMPLATES: Record<MessageType, Template> = Object.fromEntries(
  MESSAGE_TYPES.map((t) => [
    t,
    { greeting: GREETING, signOff: t === "sale" || t === "payment" ? THANKS : "— {shop}" },
  ]),
) as Record<MessageType, Template>;

/** The saved template (even an empty one) or the default. */
export function template(templates: unknown, type: MessageType): Template {
  const saved = (templates as Templates | null)?.[type];
  return saved ?? DEFAULT_TEMPLATES[type];
}

/**
 * `{name}`, `{shop}`, `{phone}` filled in. With no name the greeting drops it (and a "bhai" after
 * it): "Assalamu alaikum,". With no phone, " · {phone}" goes.
 */
export function fillTemplate(
  text: string,
  values: { name?: string | null; shop?: string | null; phone?: string | null },
) {
  let out = text;
  if (!values.name?.trim()) out = out.replace(/\s*\{name\}(\s+bhai\b)?/g, "");
  if (!values.phone?.trim()) out = out.replace(/\s*·\s*\{phone\}|\s*\{phone\}/g, "");
  return out
    .replaceAll("{name}", values.name?.trim() ?? "")
    .replaceAll("{shop}", values.shop?.trim() ?? "")
    .replaceAll("{phone}", values.phone?.trim() ?? "")
    .trim();
}

export const FALLBACK_NAME = "Mobile Business Lite";

type Named = { name?: string | null; shortName?: string | null } | null | undefined;

/** The top bar's name: the short name, else the name, else the app's own. */
export const appName = (p: Named) => p?.shortName?.trim() || p?.name?.trim() || FALLBACK_NAME;

/** The full name (browser title, login page). */
export const businessName = (p: Named) => p?.name?.trim() || FALLBACK_NAME;

/** The first of "01700000001, 01800000001". */
export const firstPhone = (phones: string | null | undefined) =>
  phones?.split(/[,;/]/)[0]?.trim() || null;

/** "Rahman Telecom (Karim)" → "rahman-telecom-karim", for file names. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "demo-business-shop-2026-10-10.xlsx". */
export function exportFileName(p: Named, date: string) {
  return `${slug(businessName(p)) || "mobile-business"}-${date}.xlsx`;
}

export type BankAccountFields = {
  bankName: string;
  branch: string | null;
  accountName: string;
  accountNumber: string;
  routingNumber: string | null;
};

/** One of the business's accounts as the How to pay chips offer it (D-040, D-041). */
export type PayAccount = { id: string; label: string; fields: BankAccountFields };

/** The fields a bank account shows, each with its own copy button (the note is not shared). */
export function bankFields(a: BankAccountFields): [label: string, value: string][] {
  const rows: [string, string | null][] = [
    ["Bank", a.bankName],
    ["Branch", a.branch],
    ["Account name", a.accountName],
    ["Account number", a.accountNumber],
    ["Routing number", a.routingNumber],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

/** Copy all / Share: one "Label: value" line per field. */
export const bankAccountText = (a: BankAccountFields) =>
  bankFields(a)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
