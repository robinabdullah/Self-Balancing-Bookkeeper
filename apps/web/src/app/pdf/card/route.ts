import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { cardPdf } from "@/pdf/account-reports";
import { pdfFileName } from "@/pdf/layout";
import { renderReportPdf } from "@/pdf/report-pdf";
import { loadStatementExtras } from "@/server/account-reports";
import { loadStatement } from "@/server/messages";
import { pdfContext, pdfResponse, refuseNonPartner } from "../respond";

// D-045 (UIDD §4.16): a card's statement for a period as a PDF (`?id=&from=&to=`), read as on its
// last day: the facts, the bills, charges and credits, and the EMI schedule.
export async function GET(request: NextRequest) {
  const refused = await refuseNonPartner();
  if (refused) return refused;
  const q = request.nextUrl.searchParams;
  const id = q.get("id");
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  if (!range || !rowId.safeParse(id).success)
    return new Response("Bad card statement request", { status: 400 });

  const [statement, extras, { business, frame }] = await Promise.all([
    loadStatement("card", id!, range.from, range.to),
    loadStatementExtras("card", id!, range.from, range.to),
    pdfContext("report", []),
  ]);
  if (!statement || extras?.kind !== "card") return new Response("No such card", { status: 404 });
  const doc = cardPdf({
    ...extras,
    name: statement.who.title,
    from: range.from,
    to: range.to,
    range: statement.range,
    label: statement.label,
  });
  return pdfResponse(
    await renderReportPdf(frame, doc),
    pdfFileName(business, "card-statement", statement.who.title, range.from, "to", range.to),
  );
}
