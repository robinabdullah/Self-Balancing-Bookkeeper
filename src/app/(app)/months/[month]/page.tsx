import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { CloseForm } from "@/components/months/close-form";
import { Breakdown, ClosedAllocations } from "@/components/months/month-snapshot";
import { ReopenMonth } from "@/components/months/reopen-month";
import { profitsFor } from "@/lib/charts/profit";
import { formatDate, formatMonth, monthOf } from "@/lib/dates";
import { nextToClose } from "@/lib/engine/months";
import { breakdownLines, closeScreen } from "@/lib/months-view";
import { partnerWarning } from "@/lib/setup";
import { loadBooks } from "@/server/books";
import { loadClose, profitSinceClose } from "@/server/months";
import { loadSetup } from "@/server/setup";

// UIDD §4.9 (tasks 5.1, 5.2, 5.4): the close screen for the next month to close (the profit
// breakdown, the investor allocations, the partner split, the profit-share reminder and Close
// month), or a closed month's read-only snapshot: its stored breakdown and allocations, and
// Re-open on the latest closed month. A later open month up to this month shows its profit
// breakdown so far, read-only (CR-024, D-044); any other month is not found.
export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const [{ data, books, asOf }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const nameOf = new Map(setup.people.map((p) => [p.id, p.name]));
  // The month's profit: a closed month's stored snapshot, else as known today (the Months page).
  const profitOf = (snapshots = {}) => profitsFor([month], snapshots, books.posted, asOf)[month];
  const back = (
    <Link
      href="/months"
      className="text-primary -ml-1 flex min-h-11 w-fit items-center gap-1 text-sm"
    >
      <ChevronLeftIcon aria-hidden className="size-4" /> Months
    </Link>
  );

  if (data.closed.some((c) => monthOf(c) === month)) {
    const close = await loadClose(month);
    if (!close) notFound();
    const latest = data.closed.map(monthOf).sort().at(-1) === month;
    const paid = latest ? await profitSinceClose(month) : [];
    const profit = profitOf({ [month]: close.snapshot });
    return (
      <>
        {back}
        <h1 className="text-xl font-semibold">{formatMonth(month)}</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Closed on {formatDate(close.closeDate)}
          {close.by && ` by ${close.by}`} · read-only
        </p>
        <Breakdown lines={breakdownLines(profit)} total={profit.total} />
        <ClosedAllocations
          rows={data.allocations.filter((a) => monthOf(a.month) === month)}
          nameOf={nameOf}
        />
        {latest && (
          <ReopenMonth
            month={month}
            close={{ id: close.id, updatedAt: close.updatedAt }}
            paid={paid}
          />
        )}
      </>
    );
  }

  const next = nextToClose(data.closed, data.entries[0]?.date ?? null, asOf);
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month > next && month <= monthOf(asOf)) {
    const profit = profitOf();
    return (
      <>
        {back}
        <h1 className="text-xl font-semibold">{formatMonth(month)}</h1>
        <p className="text-muted-foreground mb-4 text-sm">Open · close {formatMonth(next)} first</p>
        <Breakdown lines={breakdownLines(profit)} total={profit.total} />
      </>
    );
  }

  if (month !== next) notFound();
  const screen = closeScreen(data, books, setup.people, month, asOf);
  const customerOf = new Map(setup.customers.map((c) => [c.id, c.display]));
  const partners = data.partners.map((p) => ({ ...p, name: nameOf.get(p.id) ?? "Partner" }));
  const warning = partnerWarning(setup.people);

  return (
    <>
      {back}
      <h1 className="mb-4 text-xl font-semibold">Close {formatMonth(month)}</h1>
      <Breakdown lines={screen.lines} total={screen.profit.total} />

      {warning && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          {warning}
        </p>
      )}
      <CloseForm
        month={month}
        profit={screen.profit.total}
        investors={screen.investors}
        partners={partners}
      />

      {screen.reminders.length > 0 && (
        <ul
          aria-label="Reminders"
          className="mt-6 flex flex-col gap-1 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm"
        >
          {screen.reminders.map((id) => (
            <li key={id}>
              {customerOf.get(id) ?? "Customer"}: no profit share for {formatMonth(month)}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
