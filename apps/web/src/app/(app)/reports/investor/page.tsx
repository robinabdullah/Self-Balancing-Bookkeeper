import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { RangeChip } from "@/components/accounts/range-chip";
import { PeopleList } from "@/components/people/people-list";
import { InvestorView } from "@/components/report/investor-view";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { SendOverlay } from "@/components/send/send-overlay";
import { EmptyState } from "@/components/states";
import { clampDay, dhakaToday, monthOf } from "@/lib/dates";
import { investorRoutes, withQuery } from "@/lib/href";
import { parseRange, periodRange } from "@/lib/journal-filter";
import { peopleRows } from "@/lib/people-view";
import { monthsLabel } from "@/lib/report-text";
import { rowId } from "@/lib/validation/fields";
import { loadInvestorReport } from "@/server/account-reports";
import { loadBooks } from "@/server/books";
import { loadJournal } from "@/server/journal";
import { loadSetup } from "@/server/setup";

// D-045 (UIDD §4.17): the Investor report. Without `?person=`, the list of investors and partners
// (a row opens their report); with one, their report for whole months (this month by default;
// `?from=&to=` from the Report sheet, widened to whole months). `?report=1` opens the Report sheet
// (View · WhatsApp · Share PDF · Download Excel), `?send=investor` the message to the person.
export default async function InvestorReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dhakaToday();
  const person = rowId.safeParse(sp.person).success ? sp.person! : null;
  if (!person) return <InvestorList />;

  const asked = parseRange(sp);
  const range = asked
    ? { from: `${monthOf(asked.from)}-01`, to: clampDay(monthOf(asked.to), 31) }
    : periodRange("this", today)!;
  const [report, journal] = await Promise.all([
    loadInvestorReport(person, range.from, range.to),
    loadJournal(),
  ]);
  if (!report) notFound();
  const first = journal.at(-1)?.date ?? null;
  const base = withQuery("/reports/investor", { person, ...(asked && range) });
  const title = `${report.partner ? "Partner" : "Investor"} report — ${report.person.name}`;
  const routes = investorRoutes(person);

  return (
    <>
      <Link
        href="/reports/investor"
        className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
      >
        <ChevronLeftIcon aria-hidden className="size-4" /> Investor report
      </Link>
      <ReportTitle title={title} base={base} />
      {asked ? (
        <RangeChip {...range} clear={withQuery(base, { from: null, to: null })} />
      ) : (
        <p className="text-muted-foreground text-sm">
          This month · {monthsLabel(range.from, range.to)}
        </p>
      )}
      <div className="mt-4">
        <InvestorView report={report} />
      </div>

      {sp.report && (
        <ReportSheet
          base={base}
          first={first && monthOf(first)}
          today={today}
          title="Investor report"
          send="investor"
          period="months"
          pdfHref={routes.pdf}
          excelHref={routes.excel}
        />
      )}
      {sp.send === "investor" && (
        <SendOverlay
          source={{ kind: "investor", personId: person, ...range }}
          closeHref={withQuery(base, { send: null })}
        />
      )}
    </>
  );
}

/** The investors and partners: active, or still holding capital, profit owed or a difference. */
async function InvestorList() {
  const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const rows = peopleRows(setup.people, books).filter(
    (p) => p.active || p.capital !== 0 || p.profitOwed !== 0 || p.openingDifference != null,
  );
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Investor report</h1>
      {rows.length === 0 ? (
        <EmptyState hint="No investors or partners yet." />
      ) : (
        <>
          <p className="text-muted-foreground mb-2 text-sm">Pick a person for their report.</p>
          <PeopleList
            rows={rows}
            label="Investors and partners"
            href={(p) => withQuery("/reports/investor", { person: p.id })}
          />
        </>
      )}
    </>
  );
}
