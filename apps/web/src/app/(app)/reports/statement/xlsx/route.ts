import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { cardSheets, modelSheets, statementSheet } from "@mbl/domain/report-sheets";
import { rowId } from "@mbl/domain/validation/fields";
import { loadStatementExtras } from "@/server/account-reports";
import { xlsxReport } from "@/server/export";
import { loadStatement } from "@/server/messages";

// D-045 (UIDD §4.8): a customer's, supplier's or card's statement for a period as Excel
// (`?kind=&id=&from=&to=`): the Statement, then By model (customer, supplier) or the bills and
// the EMI schedule (card).
const KINDS = ["customer", "supplier", "card"] as const;
type Kind = (typeof KINDS)[number];
const HEADS: Record<Kind, [string, string]> = {
  customer: ["Debit", "Credit"],
  supplier: ["Credit", "Debit"],
  card: ["Charge", "Credit"],
};

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const kind = q.get("kind") as Kind;
  const id = q.get("id");
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  return xlsxReport(["statement", range?.from ?? "", "to", range?.to ?? ""], async () => {
    if (!KINDS.includes(kind) || !rowId.safeParse(id).success || !range) return null;
    const [statement, x] = await Promise.all([
      loadStatement(kind, id!, range.from, range.to),
      loadStatementExtras(kind, id!, range.from, range.to),
    ]);
    if (!statement || !x) return null;
    const sheet = statementSheet(
      statement.range,
      range.from,
      range.to,
      statement.label,
      HEADS[kind],
    );
    if (x.kind === "card") return cardSheets(sheet, x);
    const name = (m: string) => x.names[m] ?? "—";
    return x.kind === "customer"
      ? modelSheets(
          sheet,
          [
            ["Sales by model", x.byModel],
            ["Bought from you", x.bought],
          ],
          name,
        )
      : modelSheets(sheet, [["Purchases by model", x.byModel]], name);
  });
}
