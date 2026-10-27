import type { NextRequest } from "next/server";
import { packSheets } from "@/lib/report-sheets";
import { xlsxReport } from "@/server/export";
import { loadPack, packMonth } from "@/server/pack";

// D-045 (UIDD §4.17): the Monthly pack as Excel (`?month=YYYY-MM`), a sheet per section.
export async function GET(request: NextRequest) {
  const asked = request.nextUrl.searchParams.get("month") ?? "";
  return xlsxReport(["monthly-pack", asked], async () => {
    const month = await packMonth(asked);
    if (!month) return null;
    const { pack, names } = await loadPack(month);
    return packSheets(pack, (id) => names[id] ?? "—");
  });
}
