import { RangeChip } from "@/components/accounts/range-chip";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { SalesView } from "@/components/report/sales-view";
import { SendSheet } from "@/components/send/send-sheet";
import { dhakaToday, formatRange, monthOf } from "@mbl/domain/dates";
import { salesPdfHref, salesXlsxHref, withQuery } from "@mbl/domain/href";
import { parseRange, periodRange } from "@mbl/domain/journal-filter";
import { salesText } from "@mbl/domain/whatsapp";
import type { SalesReportView } from "@mbl/api/views/reports.controller";
import { api } from "@/api/client";

// D-043 (UIDD §4.17): the Sales report, this month by default; `?from=&to=` (the Report sheet's
// View on screen) shows another period, with its chip. `?report=1` opens the Report sheet (View ·
// WhatsApp message · Share PDF · Download Excel), `?send=sales` the message for the period.
// N-4.7: one `/views/reports/sales` read.
export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dhakaToday();
  const asked = parseRange(sp);
  const range = asked ?? periodRange("this", today)!;
  const { report, names, first } = await api<SalesReportView>(
    withQuery("/views/reports/sales", range),
  );
  const base = withQuery("/reports/sales", asked ?? {});

  return (
    <>
      <ReportTitle title="Sales report" base={base} />
      {asked ? (
        <RangeChip from={range.from} to={range.to} clear="/reports/sales" />
      ) : (
        <p className="text-muted-foreground text-sm">
          This month · {formatRange(range.from, range.to)}
        </p>
      )}
      <div className="mt-4">
        <SalesView report={report} names={names} />
      </div>

      {sp.report && (
        <ReportSheet
          base={base}
          first={first && monthOf(first)}
          today={today}
          title="Sales report"
          send="sales"
          pdfHref={salesPdfHref}
          excelHref={salesXlsxHref}
        />
      )}
      {sp.send === "sales" && (
        <SendSheet
          key={base}
          draft={{
            type: "report",
            body: salesText({ report, ...range, name: (id) => names[id] ?? "—" }),
          }}
          greeting=""
          signOff=""
          save={null}
          accounts={[]}
          closeHref={withQuery(base, { send: null })}
        />
      )}
    </>
  );
}
