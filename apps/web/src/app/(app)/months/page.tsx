import { MonthList } from "@/components/months/month-list";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { dhakaToday, monthOf } from "@/lib/dates";
import { nextToClose } from "@/lib/engine/months";
import { packPdfHref, packXlsxHref } from "@/lib/href";
import { monthList } from "@/lib/months-view";
import { loadBooks } from "@/server/books";
import { loadCloses } from "@/server/months";

// UIDD §4.9 (task 5.1, CR-024): every month from the opening to this month with its profit and
// status; the next month to close links to the close screen, the others to their page (D-044).
// D-045: the title's ⤴ Share opens the Report sheet for the Monthly pack (`?report=1`); its
// outputs open the pack page.
export default async function MonthsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string }>;
}) {
  const [{ data, books, asOf }, closes, sp] = await Promise.all([
    loadBooks(),
    loadCloses(),
    searchParams,
  ]);
  const first = data.entries[0]?.date ?? null;
  const next = nextToClose(data.closed, first, asOf);
  return (
    <>
      <ReportTitle title="Months" base="/months" />
      <MonthList rows={monthList(books.months, closes, next, monthOf(asOf))} />
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
