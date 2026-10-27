import type { NextRequest } from "next/server";
import { parseRange } from "@mbl/domain/journal-filter";
import { investorSheets } from "@mbl/domain/report-sheets";
import { rowId } from "@mbl/domain/validation/fields";
import { loadInvestorReport } from "@/server/account-reports";
import { xlsxReport } from "@/server/export";

// D-045 (UIDD §4.17): the Investor / Partner report as Excel (`?person=&from=&to=`).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const person = q.get("person");
  const range = parseRange({ from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  return xlsxReport(["investor-report", range?.from ?? "", "to", range?.to ?? ""], async () => {
    if (!range || !rowId.safeParse(person).success) return null;
    const report = await loadInvestorReport(person!, range.from, range.to);
    return report && investorSheets(report);
  });
}
