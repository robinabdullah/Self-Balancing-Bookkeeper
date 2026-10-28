import { formatDate } from "@mbl/domain/dates";
import { add, format, mul } from "@mbl/domain/money";
import { type Dues, type ItemLine, mergeLines } from "@mbl/domain/whatsapp";
import { toWords } from "@mbl/domain/words";

// D-042 (UIDD §4.16): what a sale's invoice and a customer payment's money receipt say, as text.
// The same figures as the Sale and Payment in messages (D-040). Their inputs have no cost or profit
// field: a customer document never shows them. A reversed entry prints CANCELLED, without the
// dues (they no longer hold). User feedback 2026-10-11: both show the customer's phone · address
// and the dues as a ruled sum; the invoice has an SL column, the total in words and a PAID /
// PARTLY PAID / DUE stamp; the receipt reads like a receipt book, with a "Cleared N%" bar and a
// PAID IN FULL / ADVANCE stamp.

type DocCustomer = {
  name: string;
  walkIn: boolean;
  phone?: string | null;
  address?: string | null;
};

type DocCommon = {
  /** "INV-0042" / "MR-0017", or null (an entry saved before numbers existed). */
  number: string | null;
  /** "10 Oct 2026, 3:45 PM" (or the date only when back-dated). */
  savedAt: string;
  customer: DocCustomer;
  dues: Dues;
  /** The reversal's date when the entry was reversed. */
  reversedOn: string | null;
};

export type InvoiceInput = DocCommon & { items: ItemLine[]; paidNow: number };
export type ReceiptInput = DocCommon & {
  amount: number;
  /** The sale saved with it ("Received now"), so the sum adds up; else null. */
  bill: { number: string | null; amount: number } | null;
};

/** A summary line; `rule` draws a line above it (the sum's result). */
export type DocLine = { label: string; value: string; strong?: boolean; rule?: boolean };

export type Stamp = { text: string; tone: "green" | "amber" | "red" };

/** One document: the invoice (with its lines table) or the receipt (with its amount). */
export type DocPdf = {
  title: string;
  /** "Reversed on 12 Oct 2026" under a big CANCELLED, else null. */
  cancelled: string | null;
  /** "Bill to" / "Received with thanks from", above the name. */
  to: string;
  name: string;
  /** "phone · address" under the name, when saved. */
  contact: string | null;
  date: string;
  /** The stamp beside the name; none when cancelled. */
  stamp: Stamp | null;
  table: { heads: string[]; rows: string[][]; total: string[]; words: string } | null;
  amount: { value: string; words: string } | null;
  /** The account lines: Previous due, This bill, Paid now, Current due, … */
  summary: DocLine[];
  /** Receipt only: the share of the due before it that this payment cleared, while some is left. */
  cleared: { pct: number; label: string } | null;
};

const pcs = (n: number) => `${n} ${n === 1 ? "pc" : "pcs"}`;
const signed = (n: number) => (n > 0 ? `+${format(n)}` : format(n));

/** A due line; below 0 it reads as an advance ("Previous advance", "Advance", "Advance today"). */
function due(label: "Previous due" | "Current due" | "Due now" | "Due today", n: number) {
  const advance = {
    "Previous due": "Previous advance",
    "Current due": "Advance",
    "Due now": "Advance",
    "Due today": "Advance today",
  };
  return n >= 0 ? { label, value: format(n) } : { label: advance[label], value: format(0 - n) };
}

/** The sum's result, Current / Due now (bold, ruled), and, when newer entries moved it since, Due
 * today. */
function dueAfter(label: "Current due" | "Due now", d: Dues): DocLine[] {
  return [
    { ...due(label, d.now), strong: true, rule: true },
    ...(d.today == null ? [] : [due("Due today", d.today)]),
  ];
}

const head = (kind: string, to: string, m: DocCommon) => ({
  title: m.number ? `${kind} ${m.number}` : kind,
  cancelled: m.reversedOn && `Reversed on ${formatDate(m.reversedOn)}`,
  to,
  name: m.customer.name,
  contact: [m.customer.phone, m.customer.address].filter(Boolean).join(" · ") || null,
  date: m.savedAt,
  stamp: null,
  cleared: null,
});

/** This bill against its Received now payment. */
const billStamp = (total: number, paidNow: number): Stamp =>
  paidNow >= total
    ? { text: "PAID", tone: "green" }
    : paidNow > 0
      ? { text: "PARTLY PAID", tone: "amber" }
      : { text: "DUE", tone: "red" };

export function invoicePdf(m: InvoiceInput): DocPdf {
  const items = mergeLines(m.items);
  const total = items.reduce((n, l) => add(n, mul(l.unitPrice, l.qty)), 0);
  const count = items.reduce((n, l) => n + l.qty, 0);
  const paid = m.paidNow > 0;
  const summary: DocLine[] = m.reversedOn
    ? []
    : m.customer.walkIn
      ? paid
        ? [{ label: "Paid", value: format(m.paidNow) }]
        : []
      : [
          due("Previous due", m.dues.previous),
          { label: "This bill", value: signed(total) },
          ...(paid ? [{ label: "Paid now", value: format(0 - m.paidNow) }] : []),
          ...dueAfter("Current due", m.dues),
        ];
  return {
    ...head("Invoice", "Bill to", m),
    stamp: m.reversedOn ? null : billStamp(total, m.paidNow),
    table: {
      heads: ["SL", "Model", "Qty", "Price", "Total"],
      rows: items.map((l, i) => [
        String(i + 1),
        l.model,
        String(l.qty),
        format(l.unitPrice),
        format(mul(l.unitPrice, l.qty)),
      ]),
      total: ["", `Total (${pcs(count)})`, "", "", format(total)],
      words: toWords(total),
    },
    amount: null,
    summary,
  };
}

export function receiptPdf(m: ReceiptInput): DocPdf {
  const doc = {
    ...head("Money receipt", "Received with thanks from", m),
    table: null,
    amount: { value: format(m.amount), words: toWords(m.amount) },
  };
  if (m.reversedOn || m.customer.walkIn) return { ...doc, summary: [] };
  const { now } = m.dues;
  const before = add(m.dues.previous, m.bill?.amount ?? 0);
  // A ratio, not money: rounded down so a part payment never reads 100%.
  const pct = Math.floor((m.amount * 100) / before);
  return {
    ...doc,
    summary: [
      due("Previous due", m.dues.previous),
      ...(m.bill
        ? [
            {
              label: m.bill.number ? `Bill ${m.bill.number}` : "Bill",
              value: signed(m.bill.amount),
            },
          ]
        : []),
      { label: "Received", value: format(0 - m.amount) },
      ...dueAfter("Due now", m.dues),
    ],
    cleared: before > 0 && now > 0 ? { pct, label: `Cleared ${pct}% of the due` } : null,
    stamp:
      now === 0
        ? { text: "PAID IN FULL", tone: "green" }
        : now < 0
          ? { text: `ADVANCE ${format(0 - now)}`, tone: "green" }
          : null,
  };
}
