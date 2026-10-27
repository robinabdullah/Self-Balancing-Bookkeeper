import "server-only";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { addMonths, monthOf } from "@mbl/domain/dates";
import { computeBooks } from "@mbl/domain/engine/index";
import { type MonthlyPack, OTHERS, monthlyPack, packDates } from "@mbl/domain/monthly-pack";
import { setupNames } from "@mbl/domain/setup";
import { booksOn, typeOfEntries } from "@/server/account-reports";
import { loadBooks } from "@/server/books";
import { loadSnapshots } from "@/server/months";
import { loadStockLines } from "@/server/report-lines";
import { loadSales } from "@/server/reports";
import { loadSetup } from "@/server/setup";

// D-045 (UIDD §4.17): the Monthly partner pack for one month, as on its last day (today for this
// month). The screen, PDF, Excel and message all read this one loader.

export type PackView = { pack: MonthlyPack; names: Record<string, string> };

/** The months a pack exists for: the opening month to this month (none without entries). */
export async function packMonths() {
  const { data, asOf } = await loadBooks();
  const first = data.entries[0]?.date;
  return { first: first ? monthOf(first) : null, last: monthOf(asOf), closed: data.closed };
}

/** The pack's default month: the latest closed month, else last month (D-045). */
export function defaultPackMonth(closed: string[], first: string | null, thisMonth: string) {
  const latest = closed.map(monthOf).sort().at(-1);
  if (latest) return latest;
  const last = addMonths(thisMonth, -1);
  return first && last < first ? first : last;
}

/** `?month=` when it is a month with a pack (the opening month to this month), else null. */
export async function packMonth(asked: string | undefined): Promise<string | null> {
  if (!asked || !/^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return null;
  const { first, last } = await packMonths();
  return first && asked >= first && asked <= last ? asked : null;
}

export async function loadPack(month: string): Promise<PackView> {
  const [{ data, books, asOf }, setup, typeOf] = await Promise.all([
    loadBooks(),
    loadSetup(),
    typeOfEntries(),
  ]);
  const { start, end, before } = packDates(month, asOf);
  const closed = new Set(data.closed.map(monthOf));
  const [snapshots, { report: sales }, stockLines] = await Promise.all([
    loadSnapshots([month, addMonths(month, -1)].filter((m) => closed.has(m))),
    loadSales(start, end),
    loadStockLines(end),
  ]);
  const first = data.entries[0]?.date;
  const pack = monthlyPack({
    month,
    today: asOf,
    firstMonth: first ? monthOf(first) : null,
    books,
    atStart: computeBooks(data, before),
    atEnd: booksOn(data, books, asOf, end),
    snapshots,
    allocations: data.allocations,
    closed: data.closed,
    sales,
    stockLines,
    typeOf,
    typeLabel: (t) => TYPE_LABEL[t] ?? t,
  });
  return { pack, names: { ...setupNames(setup), [OTHERS]: "Other customers" } };
}
