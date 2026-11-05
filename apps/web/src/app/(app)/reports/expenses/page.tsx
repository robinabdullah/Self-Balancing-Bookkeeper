import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { RangeChip } from "@/components/accounts/range-chip";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { ExpenseView } from "@/components/report/expense-view";
import { FilterChip } from "@/components/report/filter-chip";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { Step } from "@/components/report/step";
import { SendSheet } from "@/components/send/send-sheet";
import { addMonths, dhakaToday, formatMonth, monthOf, wholeMonth } from "@mbl/domain/dates";
import { costCategory, expenseTitle, filterLabel } from "@mbl/domain/expense-report";
import { expensesHref, expensesPdfHref, expensesXlsxHref, withQuery } from "@mbl/domain/href";
import { parseRange, periodRange } from "@mbl/domain/journal-filter";
import { expensesText } from "@mbl/domain/whatsapp";
import type { ExpensesReportView } from "@mbl/api/views/reports.controller";
import { api } from "@/api/client";

// D-075, D-080 (UIDD §4.17): the Expense statement, this month by default. A whole month has a
// ‹ month › stepper (not past this month, not before the first entry's month); another range (the
// Report sheet's View on screen) its chip. `?cat=` narrows the page and its outputs to one
// category ("Rent ✕"). `?report=1` opens the Report sheet (the period on screen first),
// `?send=expenses` the message, `?entry=` an entry over the page. One `/views/reports/expenses` read.
export default async function ExpenseStatementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dhakaToday();
  const asked = parseRange(sp);
  const range = asked ?? periodRange("this", today)!;
  const cat = costCategory(sp.cat);
  if (sp.entry) preloadEntry(sp.entry);

  const { report, names, notes, first } = await api<ExpensesReportView>(
    withQuery("/views/reports/expenses", { ...range, cat }),
  );
  const month = wholeMonth(range.from, range.to);
  const thisMonth = monthOf(today);
  const firstMonth = first && monthOf(first);
  const monthHref = (m: string) =>
    m === thisMonth ? withQuery("/reports/expenses", { cat }) : expensesHref(m, cat);
  const base = month ? monthHref(month) : withQuery("/reports/expenses", { ...range, cat });
  const title = expenseTitle(cat);

  return (
    <>
      <ReportTitle title="Expense statement" base={base} />
      {month ? (
        <nav aria-label="Month" className="flex items-center justify-between">
          <Step
            href={!firstMonth || month <= firstMonth ? null : monthHref(addMonths(month, -1))}
            label="Previous month"
          >
            <ChevronLeftIcon className="size-5" aria-hidden />
          </Step>
          <h2 className="font-semibold">
            {month === thisMonth ? `This month · ${formatMonth(month)}` : formatMonth(month)}
          </h2>
          <Step
            href={month >= thisMonth ? null : monthHref(addMonths(month, 1))}
            label="Next month"
          >
            <ChevronRightIcon className="size-5" aria-hidden />
          </Step>
        </nav>
      ) : (
        <RangeChip
          from={range.from}
          to={range.to}
          clear={withQuery("/reports/expenses", { cat })}
        />
      )}
      {cat && (
        <p className="mt-2 flex">
          <FilterChip
            label={filterLabel(cat)}
            clear={withQuery(base, { cat: null })}
            clearLabel="Show every category"
          />
        </p>
      )}
      <div className="mt-4">
        <ExpenseView report={report} names={names} notes={notes} base={base} />
      </div>

      {sp.report && (
        <ReportSheet
          base={base}
          first={firstMonth}
          today={today}
          title={title}
          shown={range}
          send="expenses"
          pdfHref={withQuery(expensesPdfHref, { cat })}
          excelHref={withQuery(expensesXlsxHref, { cat })}
        />
      )}
      {sp.send === "expenses" && (
        <SendSheet
          key={base}
          draft={{ type: "report", body: expensesText({ report, ...range }) }}
          greeting=""
          signOff=""
          save={null}
          accounts={[]}
          closeHref={withQuery(base, { send: null })}
        />
      )}
      {sp.entry && <EntryOverlay id={sp.entry} closeHref={base} />}
    </>
  );
}
