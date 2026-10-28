import { MonthList } from "@/components/months/month-list";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { dhakaToday, monthOf } from "@mbl/domain/dates";
import { packPdfHref, packXlsxHref } from "@mbl/domain/href";
import type { MonthsView } from "@mbl/api/views/admin.controller";
import { api } from "@/api/client";

// UIDD §4.9 (task 5.1, CR-024): every month from the opening to this month with its profit and
// status; the next month to close links to the close screen, the others to their page (D-044).
// D-045: the title's ⤴ Share opens the Report sheet for the Monthly pack (`?report=1`); its
// outputs open the pack page. N-4.6: one `/views/months` read.
export default async function MonthsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const [{ rows, first }, sp] = await Promise.all([api<MonthsView>("/views/months"), searchParams]);
  return (
    <>
      <ReportTitle title="Months" base="/months" />
      <MonthList rows={rows} />
      {sp.report && (
        <ReportSheet
          base="/months"
          target="/reports/pack"
          first={first && monthOf(first)}
          today={dhakaToday()}
          title="Monthly pack"
          send="pack"
          period="month"
          pdfHref={packPdfHref}
          excelHref={packXlsxHref}
        />
      )}
    </>
  );
}
