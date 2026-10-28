import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { Statement } from "@/components/accounts/statement";
import { DueTrendView } from "@/components/charts/due-trend";
import { PeriodChips } from "@/components/charts/period-chips";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { ReportSheet } from "@/components/report/report-sheet";
import { periodQuery } from "@mbl/domain/charts/period";
import { monthOf } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { rowId } from "@mbl/domain/validation/fields";
import type { CustomerTrendView } from "@mbl/api/views/accounts.controller";
import { api } from "@/api/client";

// D-064 (UIDD §4.17): a customer's Due trend (`/customers/<id>/trend`; ⋯ → Due trend, or a
// Customers owe row): the Charts period row, the due at each day end with its figures, then the
// window's statement. Walk-in has none. `?entry=` opens an entry over the page, `?report=1` the
// Report sheet (Custom). N-4.5: one `/views/customers/:id/trend` read.
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
  const { today, firstDate, period, name, trend, lines, range } = await api<CustomerTrendView>(
    withQuery(`/views/customers/${id}/trend`, { period: sp.period, from: sp.from, to: sp.to }),
  );

  const path = `/customers/${id}/trend`;
  const current = withQuery(path, periodQuery(period));
  const title = `${name} · Due trend`;

  return (
    <>
      <Link
        href={`/customers/${id}`}
        className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
      >
        <ChevronLeftIcon aria-hidden className="size-4" /> {name}
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
      <PeriodChips path={path} current={current} period={period} />
      <div className="mt-4">
        <DueTrendView trend={trend} from={period.from} to={period.to} />
      </div>
      <h2 className="mt-6 mb-2 font-semibold">Statement</h2>
      <Statement
        kind="customer"
        lines={lines}
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
