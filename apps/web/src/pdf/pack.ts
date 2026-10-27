import { positionSections } from "@/lib/dashboard";
import { formatDate, formatMonth } from "@/lib/dates";
import { add, format } from "@/lib/money";
import { type DueChange, type MonthlyPack, topGroups } from "@/lib/monthly-pack";
import { NOT_ALLOCATED, OPEN_NOTE, allocationText } from "@/lib/report-text";
import { stockColumns, stockTotal } from "@/lib/stock-movement";
import type { ReportPdf, ReportSection } from "./report";
import { groupsSection } from "./sales";

// D-045 (UIDD §4.16): what the Monthly pack PDF says, as text: the 8 sections of the screen.

const dash = (n: number | null) => (n == null ? "—" : format(n));

function duesSection(title: string, rows: DueChange[], name: (id: string) => string) {
  if (rows.length === 0) return null;
  const sum = (k: "start" | "end" | "change") => rows.reduce((n, r) => add(n, r[k]), 0);
  return {
    title,
    table: {
      heads: ["Name", "Start", "End", "Change"],
      rows: rows.map((r) => [name(r.id), format(r.start), format(r.end), format(r.change)]),
      total: ["Total", format(sum("start")), format(sum("end")), format(sum("change"))],
      widths: ["40%", "20%", "20%", "20%"],
    },
  };
}

export function packPdf(p: MonthlyPack, name: (id: string) => string): ReportPdf {
  const cols = stockColumns(p.stock);
  const st = stockTotal(p.stock);
  const sections: (ReportSection | null)[] = [
    p.closed ? null : { note: OPEN_NOTE },
    {
      title: "1. Profit & loss",
      table: {
        heads: ["", formatMonth(p.month), "Last month"],
        rows: p.profit.rows.map((r) => [r.label, format(r.amount), dash(r.last)]),
        total: ["Month profit", format(p.profit.total), dash(p.profit.last)],
        widths: ["50%", "25%", "25%"],
      },
    },
    { title: `2. Position on ${formatDate(p.end)}` },
    ...positionSections(p.position).map(
      (s): ReportSection => ({
        title: s.title,
        facts: [...s.lines, ...s.totals].map((l): [string, string] => [l.label, format(l.amount)]),
        strongLast: true,
      }),
    ),
    {
      facts: [
        [
          "Check",
          p.position.difference === 0 ? "Balanced" : `Off by ${format(p.position.difference)}`,
        ],
      ],
      strongLast: true,
    },
    {
      title: "3. Allocations",
      table:
        p.allocations.rows == null
          ? undefined
          : {
              heads: ["Person", "Allocation"],
              rows: p.allocations.rows.map((a) => [name(a.personId), allocationText(a)]),
              widths: ["35%", "65%"],
              textCols: 2,
            },
      facts: p.allocations.owed.map((o): [string, string] => [
        `${name(o.id)} — owed on ${formatDate(p.end)}`,
        format(o.amount),
      ]),
      note: p.allocations.rows == null ? `Profit ${NOT_ALLOCATED}` : undefined,
    },
    groupsSection("4. Sales by model", "Model", p.sales.byModel, name, true),
    groupsSection("Top customers", "Customer", topGroups(p.sales.byCustomer), name),
    p.stock.length === 0
      ? { title: "5. Stock movement", note: "No stock." }
      : {
          title: "5. Stock movement",
          table: {
            heads: ["Model", ...cols.map(([, h]) => h), "Value"],
            rows: p.stock.map((r) => [
              name(r.id),
              ...cols.map(([k]) => String(r[k])),
              format(r.value),
            ]),
            total: ["Total", ...cols.map(([k]) => String(st[k])), format(st.value)],
          },
        },
    duesSection("6. Customer dues", p.dues.customers, name),
    duesSection("6. Supplier dues", p.dues.suppliers, name),
    {
      title: "7. Card bills",
      table: {
        heads: ["Card", "Due", "Amount", "Left"],
        rows: p.cards.bills.map((b) => [
          name(b.cardId),
          `${formatDate(b.dueDate)}${b.overdue ? " (overdue)" : ""}`,
          format(b.amount),
          format(b.remaining),
        ]),
        widths: ["40%", "24%", "18%", "18%"],
        textCols: 2,
      },
      facts: p.cards.emi.map((e): [string, string] => [
        `${name(e.cardId)} — EMI left`,
        format(e.remaining),
      ]),
      note: p.cards.bills.length === 0 ? "No bills due next month or overdue." : undefined,
    },
    {
      title: "8. Cash flow by entry type",
      table: {
        heads: ["Type", "In", "Out"],
        rows: [
          ["Opening", format(p.cash.opening), ""],
          ...p.cash.rows.map((r) => [
            r.label,
            r.in ? format(r.in) : "",
            r.out ? format(r.out) : "",
          ]),
        ],
        total: ["Closing", format(p.cash.closing), ""],
        widths: ["50%", "25%", "25%"],
      },
    },
  ];
  return {
    title: "Monthly pack",
    period: formatMonth(p.month),
    sections: sections.filter((s): s is ReportSection => s != null),
  };
}
