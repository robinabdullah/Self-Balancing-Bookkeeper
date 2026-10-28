import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { CloseForm } from "@/components/months/close-form";
import { Breakdown, ClosedAllocations } from "@/components/months/month-snapshot";
import { ReopenMonth } from "@/components/months/reopen-month";
import { formatDate, formatMonth } from "@mbl/domain/dates";
import type { MonthView } from "@mbl/api/views/admin.controller";
import { api } from "@/api/client";

// UIDD §4.9 (tasks 5.1, 5.2, 5.4): the close screen for the next month to close (the profit
// breakdown, the investor allocations, the partner split, the profit-share reminder and Close
// month), or a closed month's read-only snapshot: its stored breakdown and allocations, and
// Re-open on the latest closed month. A later open month up to this month shows its profit
// breakdown so far, read-only (CR-024, D-044); any other month is not found. N-4.6: one
// `/views/months/:month` read (a 404 there is the not-found page).
export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const view = await api<MonthView>(`/views/months/${encodeURIComponent(month)}`);
  const back = (
    <Link
      href="/months"
      className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
    >
      <ChevronLeftIcon aria-hidden className="size-4" /> Months
    </Link>
  );

  if (view.kind === "closed") {
    return (
      <>
        {back}
        <h1 className="text-xl font-semibold">{formatMonth(month)}</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Closed on {formatDate(view.closeDate)}
          {view.by && ` by ${view.by}`} · read-only
        </p>
        <Breakdown lines={view.lines} total={view.total} />
        <ClosedAllocations rows={view.allocations} nameOf={new Map(Object.entries(view.names))} />
        {view.latest && <ReopenMonth month={month} close={view.close} paid={view.paid} />}
      </>
    );
  }

  if (view.kind === "open") {
    return (
      <>
        {back}
        <h1 className="text-xl font-semibold">{formatMonth(month)}</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Open · close {formatMonth(view.next)} first
        </p>
        <Breakdown lines={view.lines} total={view.total} />
      </>
    );
  }

  return (
    <>
      {back}
      <h1 className="mb-4 text-xl font-semibold">Close {formatMonth(month)}</h1>
      <Breakdown lines={view.lines} total={view.total} />

      {view.warning && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {view.warning}
        </p>
      )}
      <CloseForm
        month={month}
        profit={view.total}
        investors={view.investors}
        partners={view.partners}
      />

      {view.reminders.length > 0 && (
        <ul
          aria-label="Reminders"
          className="mt-6 flex flex-col gap-1 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          {view.reminders.map((r) => (
            <li key={r.id}>
              {r.name}: no profit share for {formatMonth(month)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
