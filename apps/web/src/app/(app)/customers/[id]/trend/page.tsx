import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { Statement } from "@/components/accounts/statement";
import { DueTrendView } from "@/components/charts/due-trend";
import { PeriodChips } from "@/components/charts/period-chips";
import { EntryOverlay } from "@/components/journal/entry-overlay";
import { entryLabels } from "@mbl/domain/journal/labels";
import { ReportSheet } from "@/components/report/report-sheet";
import { statementRange } from "@mbl/domain/accounts";
import { dueTrend } from "@mbl/domain/charts/customers";
import { standing } from "@mbl/domain/charts/kinds";
import { periodQuery } from "@mbl/domain/charts/period";
import { monthOf } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { rowId } from "@mbl/domain/validation/fields";
import { loadBooks } from "@/server/books";
import { loadChartPeriod } from "@/server/charts";
import { loadJournal, preloadEntry } from "@/server/journal";
import { loadSetup } from "@/server/setup";

// D-064 (UIDD §4.17): a customer's Due trend (`/customers/<id>/trend`; ⋯ → Due trend, or a
// Customers owe row): the Charts period row, the due at each day end with its figures, then the
// window's statement. Walk-in has none. `?entry=` opens an entry over the page, `?report=1` the
// Report sheet (Custom).
export default async function DueTrendPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!rowId.safeParse(id).success) notFound();
  if (sp.entry) preloadEntry(sp.entry);
  const [base, { data, books }, setup, journal] = await Promise.all([
    loadChartPeriod(sp),
    loadBooks(),
    loadSetup(),
    loadJournal(),
  ]);
  const customer = setup.customers.find((c) => c.id === id);
  if (!customer || customer.isSystem) notFound();

  const { today, firstDate, period } = base;
  const rows = books.customers[id]?.rows ?? [];
  const payments = standing(data.entries, "customer_payment")
    .filter((e) => e.table === "money" && e.customerId === id)
    .map((e) => e.date);
  const trend = dueTrend(rows, period.from, period.to, today, payments);
  const labels = entryLabels(journal);
  const range = statementRange(rows, period.from, period.to);

  const path = `/customers/${id}/trend`;
  const current = withQuery(path, periodQuery(period));
  const title = `${customer.display} · Due trend`;

  return (
    <>
      <Link
        href={`/customers/${id}`}
        className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
      >
        <ChevronLeftIcon aria-hidden className="size-4" /> {customer.display}
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      <PeriodChips path={path} current={current} period={period} />
      <div className="mt-4">
        <DueTrendView trend={trend} from={period.from} to={period.to} />
      </div>
      <h2 className="mt-6 mb-2 font-semibold">Statement</h2>
      <Statement
        kind="customer"
        lines={range.lines.map((l) => ({ ...l, label: labels.get(l.entryId) ?? "Entry" }))}
        range={range}
        base={current}
      />

      {sp.entry && <EntryOverlay id={sp.entry} closeHref={current} />}
      {sp.report && (
        <ReportSheet
          base={current}
          target={path}
          first={monthOf(firstDate)}
          today={today}
          title={title}
          send={null}
        />
      )}
    </>
  );
}
