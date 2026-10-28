import type { StatementRange } from "@mbl/domain/accounts";
import { AVG, type ModelRow, modelTotal } from "@mbl/domain/by-model";
import { formatDate, formatMonth, formatRange } from "@mbl/domain/dates";
import type { InvestorReport } from "@mbl/domain/investor-report";
import { format } from "@mbl/domain/money";
import {
  NOT_ALLOCATED,
  OPEN_NOTE,
  allocationText,
  cardState,
  monthsLabel,
} from "@mbl/domain/report-text";
import type { ReportPdf, ReportSection } from "./report";

// D-045 (UIDD §4.16): what the card statement, the By model tables and the Investor report PDFs
// say, as text, from the same models as their screens and messages.

const pcs = (n: number) => String(n);
const money = (n: number | null | undefined) => (n ? format(n) : "");

/** A By model table (Model · Pieces · Avg unit price · Amount, D-056) with its Total (no
 * average); null when empty. */
export function modelSection(
  title: string,
  rows: ModelRow[],
  name: (id: string) => string,
): ReportSection | null {
  if (rows.length === 0) return null;
  const t = modelTotal(rows);
  return {
    title,
    table: {
      heads: ["Model", "Pieces", AVG, "Amount"],
      rows: rows.map((r) => [
        name(r.id),
        pcs(r.pieces),
        r.avg == null ? "—" : format(r.avg),
        format(r.amount),
      ]),
      total: ["Total", pcs(t.pieces), "", format(t.amount)],
      widths: ["42%", "14%", "20%", "24%"],
    },
  };
}

export type CardPdfInput = {
  name: string;
  from: string;
  to: string;
  range: StatementRange;
  label: (entryId: string) => string;
  end: string;
  facts: {
    balance: number;
    nextDue: { date: string; amount: number } | null;
    overdue: number;
    remainingEmi: number;
  };
  bills: {
    month: string;
    statementDate: string;
    dueDate: string;
    amount: number;
    paid: number;
    remaining: number;
  }[];
  split: { charges: number; payments: number; refunds: number };
  emi: { label: string; schedule: { month: string; amount: number; billed: boolean }[] }[];
};

/** D-045: a card's statement for a period, read as on its last day. */
export function cardPdf(m: CardPdfInput): ReportPdf {
  const { range, facts: f } = m;
  const balance = (n: number) => (n < 0 ? `Credit ${format(0 - n)}` : format(n));
  return {
    title: "Card statement",
    name: m.name,
    period: formatRange(m.from, m.to),
    sections: [
      {
        title: `As on ${formatDate(m.end)}`,
        facts: [
          ["Balance", balance(f.balance)],
          [
            "Next due",
            f.nextDue ? `${formatDate(f.nextDue.date)} · ${format(f.nextDue.amount)}` : "—",
          ],
          ["Overdue", format(f.overdue)],
          ["Remaining EMI", format(f.remainingEmi)],
        ],
      },
      {
        title: "Bills in the period",
        table: {
          heads: ["Bill", "Statement", "Due", "Amount", "Paid", "Left"],
          rows: m.bills.map((b) => [
            formatMonth(b.month),
            formatDate(b.statementDate),
            formatDate(b.dueDate),
            format(b.amount),
            format(b.paid),
            format(b.remaining),
          ]),
          widths: ["16%", "17%", "17%", "17%", "16%", "17%"],
          textCols: 3,
        },
        note: m.bills.length === 0 ? "No bills in this period." : undefined,
      },
      {
        title: "Charges and credits",
        table: {
          heads: ["Date", "Entry", "Charge", "Credit", "Balance"],
          rows: [
            [formatDate(m.from), "Opening balance", "", "", balance(range.opening)],
            ...range.lines.map((l) => [
              formatDate(l.date),
              m.label(l.entryId),
              money(l.up),
              money(l.down),
              balance(l.balance),
            ]),
            ["", "Totals", format(range.up), format(range.down), ""],
          ],
          total: [formatDate(m.to), "Closing balance", "", "", balance(range.closing)],
          widths: ["15%", "37%", "16%", "16%", "16%"],
          textCols: 2,
        },
      },
      {
        facts: [
          ["Charges", format(m.split.charges)],
          ["Card payments", format(m.split.payments)],
          ["Refunds & cashback", format(m.split.refunds)],
        ],
      },
      ...m.emi.map((p) => ({
        title: `EMI schedule — ${p.label}`,
        table: {
          heads: ["Month", "Amount", "Status"],
          rows: p.schedule.map((s) => [
            formatMonth(s.month),
            format(s.amount),
            s.billed ? "Billed" : "To come",
          ]),
          widths: ["40%", "30%", "30%"],
        },
      })),
    ],
  };
}

/** D-045: the Investor / Partner report. */
export function investorPdf(r: InvestorReport): ReportPdf {
  const p = r.profit;
  const out = (l: { amount: number }) => format(0 - l.amount);
  return {
    title: r.partner ? "Partner report" : "Investor report",
    name: r.person.name,
    period: monthsLabel(r.from, r.to),
    sections: [
      ...(r.open ? [{ note: OPEN_NOTE }] : []),
      {
        title: "Capital",
        facts: [
          [formatDate(r.from), format(r.capital.opening)],
          ...r.capital.groups.map((g): [string, string] => [g.label, format(g.amount)]),
          [formatDate(r.to), format(r.capital.closing)],
        ],
        strongLast: true,
      },
      ...(r.cards.length > 0
        ? [
            {
              title: `Card investment (as on ${formatDate(r.to)})`,
              table: {
                heads: ["Card", "State"],
                rows: r.cards.map((c) => [c.display, cardState(c, false)]),
                widths: ["40%", "60%"],
                textCols: 2,
              },
              note: `Card payments made in ${monthsLabel(r.from, r.to)}: ${format(r.cardPayments)}`,
            },
          ]
        : []),
      {
        title: "Allocations",
        table: {
          heads: ["Month", "Allocation"],
          rows: r.months.flatMap((m) =>
            m.rows == null
              ? [[formatMonth(m.month), NOT_ALLOCATED]]
              : m.rows.length === 0
                ? [[formatMonth(m.month), "nothing allocated"]]
                : m.rows.map((a) => [formatMonth(m.month), allocationText(a)]),
          ),
          widths: ["30%", "70%"],
          textCols: 2,
        },
        note: r.months.some((m) => m.basisNote) ? "Cash basis set at close" : undefined,
      },
      {
        title: "Profit owed",
        facts: [
          [`Owed before ${formatDate(r.from)}`, format(p.before)],
          [`Allocated for ${monthsLabel(r.from, r.to)}`, format(p.allocated)],
          ...(p.later !== 0
            ? [["Allocated for later months", format(p.later)] as [string, string]]
            : []),
          ...(p.other !== 0
            ? [["Opening & corrections", format(p.other)] as [string, string]]
            : []),
          ...p.paid.map((l): [string, string] => [`Paid on ${formatDate(l.date)}`, out(l)]),
          ...p.reinvested.map((l): [string, string] => [
            `Reinvested on ${formatDate(l.date)}`,
            out(l),
          ]),
          ["Profit owed now", format(p.owedNow)],
        ],
        strongLast: true,
      },
      ...(r.partner
        ? [
            {
              title: "Partner",
              facts: [
                ["Share now", r.partner.sharePct == null ? "—" : `${r.partner.sharePct}%`],
                ...(r.partner.openingDifference != null
                  ? [
                      ["Opening difference", format(r.partner.openingDifference)] as [
                        string,
                        string,
                      ],
                    ]
                  : []),
              ] as [string, string][],
            },
          ]
        : []),
    ],
  };
}
