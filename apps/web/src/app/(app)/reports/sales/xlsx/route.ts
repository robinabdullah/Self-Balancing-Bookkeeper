import type { NextRequest } from "next/server";
import { parseRange } from "@/lib/journal-filter";
import { salesSheets } from "@/lib/sales-report";
import { xlsxReport } from "@/server/export";
import { loadSales } from "@/server/reports";

// D-043 (UIDD §4.17): the Sales report for a period as Excel (`?from=&to=`). Partner-only; a GET
// with no audit row, like the PDFs (it is a view, not the backup).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  return xlsxReport(["sales", range?.from ?? "", "to", range?.to ?? ""], async () => {
    if (!range) return null;
    const { report, names } = await loadSales(range.from, range.to);
    return salesSheets(report, (id) => names[id] ?? "—");
  });
}
