import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { pdfFileName } from "@/pdf/layout";
import { modelSection } from "@/pdf/account-reports";
import type { ReportSection } from "@/pdf/report";
import { statementPdf } from "@/pdf/statement";
import { renderStatementPdf } from "@/pdf/statement-pdf";
import { loadStatementExtras } from "@/server/account-reports";
import { loadStatement } from "@/server/messages";
import { payIds, pdfContext, pdfResponse, refuseNonPartner } from "../respond";

// D-041 (UIDD §4.16): a customer's or supplier's due statement for a period, as a PDF; D-045:
// with its By model tables.
// `?kind=customer|supplier&id=&from=&to=&pay=<business account ids>` (How to pay: customers only).
export async function GET(request: NextRequest) {
  const refused = await refuseNonPartner();
  if (refused) return refused;
  const q = request.nextUrl.searchParams;
  const kind = q.get("kind");
  const id = q.get("id");
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  if ((kind !== "customer" && kind !== "supplier") || !rowId.safeParse(id).success || !range)
    return new Response("Bad statement request", { status: 400 });

  const [statement, extras, { business, frame }] = await Promise.all([
    loadStatement(kind, id!, range.from, range.to),
    loadStatementExtras(kind, id!, range.from, range.to),
    pdfContext("statement", kind === "customer" ? payIds(q) : []),
  ]);
  if (!statement) return new Response("No such account", { status: 404 });

  const doc = statementPdf({
    kind,
    name: statement.who.title,
    from: range.from,
    to: range.to,
    range: statement.range,
    label: statement.label,
    sections: bySections(extras),
  });
  const body = await renderStatementPdf(frame, doc);
  return pdfResponse(
    body,
    pdfFileName(business, "statement", statement.who.title, range.from, "to", range.to),
  );
}

/** D-045: the By model tables after the closing line (no profit: a customer document). */
function bySections(x: Awaited<ReturnType<typeof loadStatementExtras>>): ReportSection[] {
  if (!x || x.kind === "card") return [];
  const name = (id: string) => x.names[id] ?? "—";
  const tables: [string, typeof x.byModel][] =
    x.kind === "customer"
      ? [
          ["Sales by model", x.byModel],
          ["Bought from you", x.bought],
        ]
      : [["Purchases by model", x.byModel]];
  return tables.flatMap(([title, rows]) => modelSection(title, rows, name) ?? []);
}
