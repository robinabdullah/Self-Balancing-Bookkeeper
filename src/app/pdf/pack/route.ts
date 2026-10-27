import type { NextRequest } from "next/server";
import { pdfFileName } from "@/pdf/layout";
import { packPdf } from "@/pdf/pack";
import { renderReportPdf } from "@/pdf/report-pdf";
import { loadPack, packMonth } from "@/server/pack";
import { pdfContext, pdfResponse, refuseNonPartner } from "../respond";

// D-045 (UIDD §4.16): the Monthly pack as a PDF (`?month=YYYY-MM`). An internal report frame.
export async function GET(request: NextRequest) {
  const refused = await refuseNonPartner();
  if (refused) return refused;
  const month = await packMonth(request.nextUrl.searchParams.get("month") ?? undefined);
  if (!month) return new Response("Bad monthly pack request", { status: 400 });

  const [{ pack, names }, { business, frame }] = await Promise.all([
    loadPack(month),
    pdfContext("report", []),
  ]);
  const body = await renderReportPdf(
    frame,
    packPdf(pack, (id) => names[id] ?? "—"),
  );
  return pdfResponse(body, pdfFileName(business, "monthly-pack", month));
}
