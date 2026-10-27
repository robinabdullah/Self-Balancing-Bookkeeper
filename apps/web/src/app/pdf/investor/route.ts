import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { rowId } from "@mbl/domain/validation/fields";
import { investorPdf } from "@/pdf/account-reports";
import { pdfFileName } from "@/pdf/layout";
import { renderReportPdf } from "@/pdf/report-pdf";
import { loadInvestorReport } from "@/server/account-reports";
import { pdfContext, pdfResponse, refuseNonPartner } from "../respond";

// D-045 (UIDD §4.16): the Investor / Partner report as a PDF (`?person=&from=&to=`). An internal
// report frame: no How to pay, no terms.
export async function GET(request: NextRequest) {
  const refused = await refuseNonPartner();
  if (refused) return refused;
  const q = request.nextUrl.searchParams;
  const person = q.get("person");
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  if (!range || !rowId.safeParse(person).success)
    return new Response("Bad investor report request", { status: 400 });

  const [report, { business, frame }] = await Promise.all([
    loadInvestorReport(person!, range.from, range.to),
    pdfContext("report", []),
  ]);
  if (!report) return new Response("No such person", { status: 404 });
  const body = await renderReportPdf(frame, investorPdf(report));
  return pdfResponse(
    body,
    pdfFileName(business, "investor-report", report.person.name, range.from, "to", range.to),
  );
}
