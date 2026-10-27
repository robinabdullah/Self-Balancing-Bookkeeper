import { notFound } from "next/navigation";
import { PackView } from "@/components/report/pack-view";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { SendSheet } from "@/components/send/send-sheet";
import { EmptyState } from "@/components/states";
import { dhakaToday, formatDate, formatMonth } from "@mbl/domain/dates";
import { packPdfHref, packXlsxHref, withQuery } from "@mbl/domain/href";
import { packText } from "@mbl/domain/report-text";
import { defaultPackMonth, loadPack, packMonth, packMonths } from "@/server/pack";

// D-045 (UIDD §4.17): the Monthly partner pack, one month (`?month=`; the latest closed month by
// default, else last month). `?report=1` opens the Report sheet (one month: View · WhatsApp ·
// Share PDF · Download Excel), `?send=pack` the message. A month outside the opening…this month
// is not found.
export default async function PackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dhakaToday();
  const { first, last, closed } = await packMonths();
  if (!first) {
    return (
      <>
        <h1 className="mb-3 text-xl font-semibold">Monthly pack</h1>
        <EmptyState hint="No months yet." />
      </>
    );
  }
  const month = sp.month ? await packMonth(sp.month) : defaultPackMonth(closed, first, last);
  if (!month) notFound();
  const { pack, names } = await loadPack(month);
  const base = withQuery("/reports/pack", { month });

  return (
    <>
      <ReportTitle title={`Monthly pack — ${formatMonth(month)}`} base={base} />
      <p className="text-muted-foreground mb-4 text-sm">
        {pack.closed ? "Closed" : "Open"} · as on {formatDate(pack.end)}
      </p>
      <PackView pack={pack} names={names} />

      {sp.report && (
        <ReportSheet
          base={base}
          first={first}
          today={today}
          title="Monthly pack"
          send="pack"
          period="month"
          pdfHref={packPdfHref}
          excelHref={packXlsxHref}
        />
      )}
      {sp.send === "pack" && (
        <SendSheet
          key={base}
          draft={{ type: "report", body: packText(pack, (id) => names[id] ?? "—") }}
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
