import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { pdfFileName } from "@/pdf/layout";
import { salesPdf } from "@/pdf/sales";
import { renderReportPdf } from "@/pdf/report-pdf";
import { loadSales } from "@/server/reports";
import { pdfContext, pdfResponse, refuseNonPartner } from "../respond";

// D-043 (UIDD §4.17): the Sales report for a period as a PDF (`?from=&to=`). An internal report:
// no How to pay and no terms or footer line (those are for customers).
export async function GET(request: NextRequest) {
  const refused = await refuseNonPartner();
  if (refused) return refused;
  const q = request.nextUrl.searchParams;
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  if (!range) return new Response("Bad sales report request", { status: 400 });

  const [{ report, names }, { business, frame }] = await Promise.all([
    loadSales(range.from, range.to),
    pdfContext("report", []),
  ]);
  const doc = salesPdf({ report, ...range, name: (id) => names[id] ?? "—" });
  const body = await renderReportPdf(frame, doc);
  return pdfResponse(body, pdfFileName(business, "sales", range.from, "to", range.to));
}
