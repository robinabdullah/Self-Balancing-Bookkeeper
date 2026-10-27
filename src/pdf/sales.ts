import { AVG } from "@/lib/by-model";
import { formatRange } from "@/lib/dates";
import { add, format } from "@/lib/money";
import type { SalesGroup, SalesReport } from "@/lib/sales-report";
import type { ReportPdf, ReportSection } from "./report";

// D-043 (UIDD §4.17): what the Sales report PDF says, as text: the totals, then By model (with the
// Avg unit price, D-056) and By customer (net of returns), each with its Total row. An internal report: no How to pay, no terms.

export type SalesPdfInput = {
  report: SalesReport;
  from: string;
  to: string;
  /** A model's or a customer's name. */
  name: (id: string) => string;
};

const WIDTHS = ["46%", "14%", "20%", "20%"];
const AVG_WIDTHS = ["36%", "12%", "18%", "17%", "17%"];

/** A By model / By customer table (Pieces · Sales · Profit; D-056: By model adds the Avg unit
 * price after Pieces, blank on the Total row); null when empty. */
export function groupsSection(
  title: string,
  head: string,
  groups: SalesGroup[],
  name: (id: string) => string,
  avg = false,
): ReportSection | null {
  if (groups.length === 0) return null;
  const sum = (k: "pieces" | "sales" | "profit") => groups.reduce((s, g) => add(s, g[k]), 0);
  const only = (cells: string[]) => cells.filter((_, i) => avg || i !== 2);
  return {
    title,
    table: {
      heads: only([head, "Pieces", AVG, "Sales", "Profit"]),
      rows: groups.map((g) =>
        only([
          name(g.id),
          String(g.pieces),
          g.avg == null ? "—" : format(g.avg),
          format(g.sales),
          format(g.profit),
        ]),
      ),
      total: only([
        "Total",
        String(sum("pieces")),
        "",
        format(sum("sales")),
        format(sum("profit")),
      ]),
      widths: avg ? AVG_WIDTHS : WIDTHS,
    },
  };
}

export function salesPdf({ report: r, from, to, name }: SalesPdfInput): ReportPdf {
  return {
    title: "Sales report",
    period: formatRange(from, to),
    sections: [
      {
        facts: [
          ["Bills", String(r.bills)],
          ["Pieces", String(r.pieces)],
          ["Sales", format(r.sales)],
          ["Cost", format(r.cost)],
          ["Gross profit", format(r.grossProfit)],
          ["Margin", r.margin == null ? "—" : `${r.margin}%`],
          ["Returns", `${r.returns.pieces} pcs · ${format(r.returns.amount)}`],
          ["Returns profit", format(r.returns.profit)],
          ["Net sales profit", format(r.netProfit)],
        ],
        strongLast: true,
      },
      groupsSection("By model", "Model", r.byModel, name, true),
      groupsSection("By customer", "Customer", r.byCustomer, name),
    ].filter((s): s is ReportSection => s != null),
  };
}
