import { formatDate, formatMonth, formatRange } from "@mbl/domain/dates";
import {
  type ExpenseReport,
  costLabel,
  elsewhereLine,
  elsewhereNote,
  expenseTitle,
  noteOf,
  paidFromLabel,
  spendLine,
} from "@mbl/domain/expense-report";
import { viewHelp } from "@mbl/domain/help-text";
import { format } from "@mbl/domain/money";
import type { ReportPdf, ReportSection } from "./report";

// D-075, D-080 (UIDD §4.17): what the Expense statement PDF says, as text: the total and the
// Cash / Cards line, By category (with shares), then the entries oldest first, each table with a
// Total row; the note when a row is tagged. It follows the `?cat=` filter. An internal report.

export type ExpensesPdfInput = {
  report: ExpenseReport;
  from: string;
  to: string;
  /** A card's name. */
  name: (id: string) => string;
  notes: Record<string, string>;
};

export function expensesPdf({ report: r, from, to, name, notes }: ExpensesPdfInput): ReportPdf {
  const sections: ReportSection[] = [
    {
      facts: [
        ["Entries", spendLine(r)],
        ["Total spent", format(r.total)],
      ],
      strongLast: true,
    },
  ];
  const away = elsewhereNote(r);
  // D-080: the expenses dated in another month that this month's profit counts.
  if (away && r.elsewhere) {
    const lines = r.elsewhere.rows.map((row) => `${elsewhereLine(row)} · ${format(row.amount)}`);
    sections[0].note = [away, ...lines].join("\n");
  }
  if (r.rows.length === 0) {
    sections.push({ note: "No expenses in this period" });
  } else {
    sections.push(
      {
        title: "By category",
        table: {
          heads: ["Category", "Amount", "Share"],
          rows: r.byCategory.map((c) => [
            c.label,
            format(c.amount),
            c.share == null ? "—" : `${c.share}%`,
          ]),
          total: ["Total", format(r.total), ""],
          widths: ["50%", "30%", "20%"],
        },
      },
      {
        title: "Entries",
        table: {
          heads: ["Date", "Category", "Paid from", "Note", "Amount"],
          rows: r.rows.map((row) => [
            row.tagged
              ? `${formatDate(row.date)} (for ${formatMonth(row.forMonth)})`
              : formatDate(row.date),
            costLabel(row),
            paidFromLabel(row, name),
            noteOf(row, notes),
            format(row.amount),
          ]),
          total: ["Total", "", "", "", format(r.total)],
          widths: ["20%", "18%", "18%", "26%", "18%"],
          textCols: 4,
        },
        note: r.tagged ? viewHelp.expenseStatement : undefined,
      },
    );
  }
  return { title: expenseTitle(r.cat), period: formatRange(from, to), sections };
}
