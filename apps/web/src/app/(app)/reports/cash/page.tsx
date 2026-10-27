import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { RangeChip } from "@/components/accounts/range-chip";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { Amount } from "@/components/amount";
import { CashCount } from "@/components/report/cash-count";
import { CashDayView, dayLabel } from "@/components/report/cash-book-view";
import { ReportSheet } from "@/components/report/report-sheet";
import { ReportTitle } from "@/components/report/report-title";
import { SendSheet } from "@/components/send/send-sheet";
import { addDays, dhakaToday, formatDate, monthOf } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseRange } from "@mbl/domain/journal-filter";
import { cn } from "@/lib/utils";
import { cashBookText } from "@mbl/domain/whatsapp";
import { cashLabel, loadCashBook } from "@/server/reports";

// D-043 (UIDD §4.17): the Cash book. Today by default; `?day=` steps through the days (not past
// today, not before the first entry); `?from=&to=` (the Report sheet's View on screen) shows a
// range, each day with cash moves. Count cash on today's page only. `?report=1` opens the Report
// sheet, `?send=cash` the day book message for the period, `?entry=` an entry over the page.
export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const today = dhakaToday();
  const asked = parseRange(sp);
  const range = asked && asked.from !== asked.to ? asked : null;
  const pickedDay = asked?.from ?? parseRange({ from: sp.day, to: sp.day })?.from;
  const day = pickedDay && pickedDay <= today ? pickedDay : today;
  if (sp.entry) preloadEntry(sp.entry);

  const { book, labels, first } = await loadCashBook(range?.from ?? day, range?.to ?? day);
  const dayHref = (d: string) => withQuery("/reports/cash", { day: d === today ? null : d });
  const base = range ? withQuery("/reports/cash", range) : dayHref(day);
  const quiet = { date: day, opening: book.opening, rows: [], closing: book.closing };
  const message = cashBookText({ book, label: (id) => cashLabel(labels, id) });

  return (
    <>
      <ReportTitle title="Cash book" base={base} />
      {range ? (
        <>
          <RangeChip from={range.from} to={range.to} clear="/reports/cash" />
          <dl className="mt-3 mb-4 grid grid-cols-2 gap-2 text-sm">
            <Figure label="Opening" poisha={book.opening} />
            <Figure label="Closing" poisha={book.closing} />
          </dl>
          {book.days.length === 0 && (
            <p className="text-muted-foreground text-sm">No cash in or out in this period.</p>
          )}
          <div className="flex flex-col gap-4">
            {book.days.map((d) => (
              <section key={d.date} aria-label={formatDate(d.date)} className="flex flex-col gap-2">
                <h2 className="font-semibold">{formatDate(d.date)}</h2>
                <CashDayView day={d} labels={labels} base={base} label={dayLabel(d.date)} />
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <nav aria-label="Day" className="flex items-center justify-between">
            <Step
              href={!first || day <= first ? null : dayHref(addDays(day, -1))}
              label="Previous day"
            >
              <ChevronLeftIcon className="size-5" aria-hidden />
            </Step>
            <h2 className="font-semibold">
              {day === today ? `Today · ${formatDate(day)}` : formatDate(day)}
            </h2>
            <Step href={day >= today ? null : dayHref(addDays(day, 1))} label="Next day">
              <ChevronRightIcon className="size-5" aria-hidden />
            </Step>
          </nav>
          <CashDayView
            day={book.days[0] ?? quiet}
            labels={labels}
            base={base}
            label={dayLabel(day)}
          />
          {book.days.length === 0 && (
            <p className="text-muted-foreground text-sm">No cash in or out on this day.</p>
          )}
          {day === today && <CashCount closing={book.closing} />}
        </div>
      )}

      {sp.report && (
        <ReportSheet
          base={base}
          first={first && monthOf(first)}
          today={today}
          title="Cash book"
          day={range ? undefined : day}
          send="cash"
        />
      )}
      {sp.send === "cash" && (
        <SendSheet
          key={base}
          draft={{ type: "report", body: message }}
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

function Figure({ label, poisha }: { label: string; poisha: number }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">
        <Amount poisha={poisha} />
      </dd>
    </div>
  );
}

function Step({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = "flex size-11 items-center justify-center rounded-lg";
  return href ? (
    <Link href={href} aria-label={label} className={cn(cls, "hover:bg-muted")}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cn(cls, "text-muted-foreground/50")}>
      {children}
    </span>
  );
}
