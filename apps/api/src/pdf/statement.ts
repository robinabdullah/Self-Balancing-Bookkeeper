import type { StatementRange } from "@mbl/domain/accounts";
import { formatDate, formatRange } from "@mbl/domain/dates";
import { format } from "@mbl/domain/money";
import type { ReportSection } from "./report";

// D-041 (UIDD §4.16): what a customer's or supplier's due statement PDF says, as text. Its input
// has no cost or profit field: a customer document never shows them. A customer's due going up
// is a debit; a supplier's (we owe more) is a credit, as on screen.

export type DueKind = "customer" | "supplier";

export type StatementPdfInput = {
  kind: DueKind;
  /** The account's name ("Rahman Telecom (Karim)"). */
  name: string;
  from: string;
  to: string;
  range: StatementRange;
  /** Each entry's label with its number ("Sale INV-0042"). */
  label: (entryId: string) => string;
  /** D-045: the By model tables after the closing line. */
  sections?: ReportSection[];
};

export type StatementRow = {
  cells: [date: string, entry: string, debit: string, credit: string, balance: string];
  /** Opening, Totals and Closing. */
  strong?: boolean;
};

export type StatementPdf = {
  title: string;
  name: string;
  period: string;
  heads: StatementRow["cells"];
  rows: StatementRow[];
  /** "Please pay ৳X", "Balance due to you: ৳X", "Advance ৳X", "No due". */
  closing: string;
  sections?: ReportSection[];
};

const money = (n: number | null) => (n ? format(n) : "");

/** The closing line in the reader's words. */
export function closingLine(kind: DueKind, closing: number) {
  if (closing === 0) return "No due";
  if (kind === "customer")
    return closing > 0 ? `Please pay ${format(closing)}` : `Advance ${format(0 - closing)}`;
  return closing > 0
    ? `Balance due to you: ${format(closing)}`
    : `Advance paid ${format(0 - closing)}`;
}

export function statementPdf(m: StatementPdfInput): StatementPdf {
  const { range } = m;
  const pick = <T>(up: T, down: T) => (m.kind === "supplier" ? [down, up] : [up, down]);
  const row = (
    date: string,
    entry: string,
    up: number | null,
    down: number | null,
    balance: number,
  ) => [date, entry, ...pick(up, down).map(money), format(balance)] as StatementRow["cells"];
  return {
    title: "Statement of account",
    name: m.name,
    period: formatRange(m.from, m.to),
    heads: ["Date", "Entry", "Debit", "Credit", "Balance"],
    rows: [
      {
        cells: row(formatDate(m.from), "Opening balance", null, null, range.opening),
        strong: true,
      },
      ...range.lines.map((l) => ({
        cells: row(formatDate(l.date), m.label(l.entryId), l.up, l.down, l.balance),
      })),
      {
        cells: [
          "",
          "Totals",
          ...pick(range.up, range.down).map(format),
          "",
        ] as StatementRow["cells"],
        strong: true,
      },
      { cells: row(formatDate(m.to), "Closing balance", null, null, range.closing), strong: true },
    ],
    closing: closingLine(m.kind, range.closing),
    sections: m.sections,
  };
}
