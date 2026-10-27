import { type StatementKind, type StatementRange, supplierDueText } from "@/lib/accounts";
import type { BankAccountFields } from "@/lib/business";
import { piecesAt } from "@/lib/by-model";
import { formatDate, formatMonth, formatRange } from "@/lib/dates";
import { add, format, mul } from "@/lib/money";
import { toWords } from "@/lib/words";
import type { CashBook, CashRow } from "@/lib/cash-book";
import type { SalesReport } from "@/lib/sales-report";

// D-040: every WhatsApp message, as plain text in the sectioned + emoji style of the v1.1 plan's
// samples (`*bold*`, `_italic_`, `- ` bullets). Each builder returns the body only: the send
// preview adds the template's greeting before it and the sign-off after it (D-039). Pure; every
// number comes from the books (the server passes them in), integer poisha.

/** The entry types a message is sent for (the toast's Send ▸, the entry sheet, the Bills tab). */
export const SEND_TYPES = new Set([
  "sale",
  "customer_payment",
  "customer_return",
  "customer_discount",
  "customer_profit_share",
]);

/** Over this many characters a wa.me link can be cut on some phones: Copy + Open chat instead. */
export const LONG_TEXT = 1500;

export const invoiceLabel = (n: number) => `INV-${String(n).padStart(4, "0")}`;
export const receiptLabel = (n: number) => `MR-${String(n).padStart(4, "0")}`;

/**
 * The number to send to, as wa.me wants it ("8801XXXXXXXXX"): the first number in the field,
 * written 01…, +880… or 880… (spaces and dashes allowed). Anything else → null (Share instead).
 */
export function waNumber(text: string | null | undefined): string | null {
  const first = text?.split(/[,;/]/)[0]?.replace(/[\s-]/g, "") ?? "";
  if (/^01\d{9}$/.test(first)) return `88${first}`;
  const m = /^\+?(8801\d{9})$/.exec(first);
  return m ? m[1] : null;
}

/** The WhatsApp number, else the phone. */
export const recipientNumber = (whatsapp: string | null, phone: string | null) =>
  waNumber(whatsapp) ?? waNumber(phone);

/** A chat with `number`, with the text typed in (or just the chat). */
export const waLink = (number: string, text?: string) =>
  `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** Greeting, body, How to pay and sign-off, a blank line apart; empty parts are left out. */
export function compose(parts: (string | null | undefined | false)[]) {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

export type ItemLine = { model: string; qty: number; unitPrice: number };

/** A sale line split over lots is stored as one row per lot: shown once, by model and price. */
export function mergeLines(lines: ItemLine[]): ItemLine[] {
  const out: ItemLine[] = [];
  for (const l of lines) {
    const same = out.find((o) => o.model === l.model && o.unitPrice === l.unitPrice);
    if (same) same.qty += l.qty;
    else out.push({ ...l });
  }
  return out;
}

const signed = (n: number) => (n > 0 ? `+${format(n)}` : format(n));
const pcs = (n: number) => `${n} ${n === 1 ? "pc" : "pcs"}`;
const day = (date: string) => formatDate(date).slice(0, 6);

/** "Due now: ৳X"; in credit "Advance: ৳X" ("Previous advance", "Advance today", …). */
function due(label: string, n: number) {
  if (n >= 0) return `${label}: ${format(n)}`;
  const credit =
    label === "Due now" ? "Advance" : label.replace("Due", "Advance").replace("due", "advance");
  return `${credit}: ${format(0 - n)}`;
}

export type Dues = { previous: number; now: number; today: number | null };

/** "*Due now: ৳X*" and, when newer entries moved it since, "Due today: ৳Y". */
function dueNow(d: Dues, bullet = "") {
  return [
    `${bullet}*${due("Due now", d.now)}*`,
    d.today == null ? null : `${bullet}${due("Due today", d.today)}`,
  ];
}

const lines = (rows: (string | null | undefined | false)[]) =>
  rows.filter((r) => r != null && r !== false).join("\n");

type Customer = { name: string; walkIn: boolean };

export type SaleMessage = {
  shop: string;
  invoiceNo: number | null;
  savedAt: string;
  customer: Customer;
  items: ItemLine[];
  /** The "Received now" payment saved with the bill (0 if none). */
  paidNow: number;
  dues: Dues;
};

/** Long example 1: header, 📱 Items, 📒 Your account (Walk-in has no account). */
export function saleText(m: SaleMessage) {
  const items = mergeLines(m.items);
  const total = items.reduce((n, l) => add(n, mul(l.unitPrice, l.qty)), 0);
  const count = items.reduce((n, l) => n + l.qty, 0);
  const invoice = m.invoiceNo == null ? "*Invoice*" : `*Invoice ${invoiceLabel(m.invoiceNo)}*`;
  const head = lines([
    `🧾 *${m.shop}*`,
    `${invoice} · ${m.savedAt}`,
    !m.customer.walkIn && `👤 ${m.customer.name}`,
  ]);
  const body = lines([
    "📱 *Items*",
    ...items.map(
      (l, i) =>
        `${i + 1}. ${l.model} × ${l.qty} @ ${format(l.unitPrice)} = ${format(mul(l.unitPrice, l.qty))}`,
    ),
    `*Total: ${format(total)}* (${pcs(count)})`,
    m.customer.walkIn && m.paidNow > 0 && `Paid: ${format(m.paidNow)}`,
  ]);
  const account =
    !m.customer.walkIn &&
    lines([
      "📒 *Your account*",
      `- ${due("Previous due", m.dues.previous)}`,
      `- This bill: ${signed(total)}`,
      m.paidNow > 0 && `- Paid now: ${format(0 - m.paidNow)}`,
      ...dueNow(m.dues, "- "),
    ]);
  return compose([head, body, account]);
}

export type PaymentMessage = {
  receiptNo: number | null;
  savedAt: string;
  customer: Customer;
  amount: number;
  dues: Dues;
};

export function paymentText(m: PaymentMessage) {
  const title = m.receiptNo == null ? "" : ` — ${receiptLabel(m.receiptNo)}`;
  return compose([
    lines([`✅ *Payment received${title}*`, `${m.customer.name} · ${m.savedAt}`]),
    lines([`Amount: *${format(m.amount)}*`, `_${toWords(m.amount)}_`]),
    !m.customer.walkIn && lines([due("Previous due", m.dues.previous), ...dueNow(m.dues)]),
  ]);
}

export type ReturnMessage = {
  savedAt: string;
  customer: Customer;
  items: ItemLine[];
  refund: number;
  dues: Dues;
};

export function returnText(m: ReturnMessage) {
  return compose([
    lines([`↩️ *Return received* · ${m.savedAt}`, m.customer.name]),
    lines([
      ...mergeLines(m.items).map((l) => `- ${l.model} × ${l.qty} @ ${format(l.unitPrice)}`),
      m.customer.walkIn
        ? `Refund: ${format(m.refund)}`
        : `Refund to your due: ${format(0 - m.refund)}`,
    ]),
    !m.customer.walkIn && lines(dueNow(m.dues)),
  ]);
}

export type DiscountMessage = { savedAt: string; customer: Customer; amount: number; dues: Dues };

export function discountText(m: DiscountMessage) {
  return lines([
    `🎁 *Discount* · ${m.savedAt}`,
    m.customer.name,
    `Discount: ${format(m.amount)}`,
    ...dueNow(m.dues),
  ]);
}

export type ProfitShareMessage = DiscountMessage & {
  forMonth: string | null;
  /** Added to their due (else received in cash). */
  toDue: boolean;
};

export function profitShareText(m: ProfitShareMessage) {
  const month = m.forMonth ? ` — ${formatMonth(m.forMonth)}` : "";
  return lines([
    `📈 *Profit share${month}* · ${m.savedAt}`,
    m.customer.name,
    m.toDue ? `Added to your due: ${format(m.amount)}` : `Paid to you in cash: ${format(m.amount)}`,
    ...dueNow(m.dues),
  ]);
}

export type ReminderMessage = {
  due: number;
  asOf: string;
  lastPayment: { amount: number; date: string } | null;
};

/** ⋯ → Remind on WhatsApp: the due as of today and the last payment. */
export function reminderText(m: ReminderMessage) {
  return lines([
    "🔔 *Payment reminder*",
    `Your due with us is *${format(m.due)}* as of ${formatDate(m.asOf)}.`,
    m.lastPayment &&
      `Last payment: ${format(m.lastPayment.amount)} on ${formatDate(m.lastPayment.date)}.`,
  ]);
}

const STATEMENT_TITLE: Record<StatementKind, string> = {
  customer: "Statement",
  supplier: "Statement",
  card: "Card statement",
  person: "Capital statement",
};

/** How each kind words its opening and closing balance. */
function balanceText(kind: StatementKind, which: "Opening" | "Closing", n: number) {
  if (kind === "customer") return due(`${which} due`, n);
  if (kind === "supplier") return `${which}: ${supplierDueText(n)}`;
  if (kind === "card")
    return n < 0 ? `${which} card credit: ${format(0 - n)}` : `${which} balance: ${format(n)}`;
  return `${which} capital: ${format(n)}`;
}

export type StatementMessage = {
  kind: StatementKind;
  name: string;
  from: string;
  to: string;
  range: StatementRange;
  /** Each entry's label ("Sale INV-0042", "Payment in MR-0017"). */
  label: (entryId: string) => string;
  /** D-045: the report's additions after the closing (By model, a card's bills and EMI). */
  extra?: string | null;
};

/** A statement for a period: opening, each entry, closing. */
export function statementText(m: StatementMessage) {
  const { range } = m;
  return compose([
    lines([`📄 *${STATEMENT_TITLE[m.kind]} — ${m.name}*`, formatRange(m.from, m.to)]),
    lines([
      balanceText(m.kind, "Opening", range.opening),
      ...range.lines.map((l) => `- ${day(l.date)} ${m.label(l.entryId)}: ${signed(l.amount)}`),
      range.lines.length === 0 && "No entries in this period.",
      `*${balanceText(m.kind, "Closing", range.closing)}*`,
    ]),
    m.extra,
  ]);
}

/** 🏦 How to pay: the picked business accounts (the note is never shared, D-039). */
export function howToPayText(accounts: BankAccountFields[]) {
  if (accounts.length === 0) return null;
  return lines([
    "🏦 *How to pay*",
    ...accounts.map((a) =>
      lines([
        `- ${a.branch ? `${a.bankName} · ${a.branch}` : a.bankName}`,
        `  A/C name: ${a.accountName}`,
        `  A/C no: ${a.accountNumber}`,
        a.routingNumber && `  Routing: ${a.routingNumber}`,
      ]),
    ),
  ]);
}

export type CashBookMessage = {
  book: CashBook;
  /** Each row's entry and who ("Payment in MR-0017 Rahman Telecom"). */
  label: (entryId: string) => string;
};

/** D-043: the day book (the v1.1 plan's sample); a range has one block per day. */
export function cashBookText({ book, label }: CashBookMessage) {
  const one = book.from === book.to;
  const row = (r: CashRow) =>
    `- ${r.amount > 0 ? "In" : "Out"}: ${label(r.id)} ${format(Math.abs(r.amount))}`;
  return lines([
    `💵 *Cash book — ${one ? formatDate(book.from) : formatRange(book.from, book.to)}*`,
    `Opening: ${format(book.opening)}`,
    ...book.days.flatMap((d) => (one ? d.rows.map(row) : [`_${day(d.date)}_`, ...d.rows.map(row)])),
    book.days.length === 0 && "No cash in or out.",
    `*Closing: ${format(book.closing)}*`,
  ]);
}

export type SalesMessage = {
  report: SalesReport;
  from: string;
  to: string;
  /** A model's name. */
  name: (modelId: string) => string;
};

/** D-043: the Sales report's totals and the models. */
export function salesText({ report: r, from, to, name }: SalesMessage) {
  return compose([
    lines([
      `📊 *Sales — ${formatRange(from, to)}*`,
      `Bills: ${r.bills} · ${pcs(r.pieces)}`,
      `Sales: ${format(r.sales)}`,
      `Gross profit: ${format(r.grossProfit)}${r.margin == null ? "" : ` (${r.margin}%)`}`,
      r.returns.pieces !== 0 &&
        `Returns: ${pcs(r.returns.pieces)} · ${format(r.returns.amount)} (profit ${signed(r.returns.profit)})`,
      `*Net sales profit: ${format(r.netProfit)}*`,
    ]),
    r.byModel.length > 0 &&
      lines([
        "📱 *By model*",
        ...r.byModel.map(
          (g) =>
            `- ${name(g.id)}: ${piecesAt(g)} · ${format(g.sales)} · profit ${format(g.profit)}`,
        ),
      ]),
  ]);
}
