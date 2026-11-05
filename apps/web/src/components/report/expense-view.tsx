import Link from "next/link";
import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import { formatDate, formatMonth } from "@mbl/domain/dates";
import {
  type CostRow,
  type ExpenseReport,
  costLabel,
  elsewhereLine,
  elsewhereNote,
  noteOf,
  paidFromLabel,
  spendLine,
} from "@mbl/domain/expense-report";
import { viewHelp } from "@mbl/domain/help-text";
import { entryHref, withQuery } from "@mbl/domain/href";
import { cn } from "@/lib/utils";

// D-075, D-080 (UIDD §4.17): the Expense statement. Total spent and the Cash / Cards line, then
// By category (a row per category with a share bar; a tap filters to it, `?cat=`), then the
// entries oldest first. At ≥ 1024px the entries are a table; on a phone one item per entry. A
// tagged row ("for Sep 2026", amber) brings the note. A row opens the entry over the page. A whole
// month names, under the Total, the expenses dated elsewhere that count in its profit.

type Props = {
  report: ExpenseReport;
  names: Record<string, string>;
  notes: Record<string, string>;
  /** This page without `entry` (keeps the period and the filter). */
  base: string;
};

const PILL =
  "rounded-full border border-amber-500/50 bg-amber-500/10 px-2 text-xs font-medium text-amber-800 dark:text-amber-300";

export function ExpenseView({ report: r, names, notes, base }: Props) {
  if (r.rows.length === 0)
    return (
      <div className="flex flex-col gap-4">
        <EmptyState hint="No expenses in this period." />
        <Elsewhere report={r} base={base} />
      </div>
    );
  const name = (id: string) => names[id] ?? "—";
  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Total spent" className="flex flex-col gap-0.5">
        <h2 className="text-muted-foreground text-sm">Total spent</h2>
        <p className="text-3xl font-semibold">
          <Amount poisha={r.total} />
        </p>
        <p className="text-muted-foreground text-sm">{spendLine(r)}</p>
        <Elsewhere report={r} base={base} />
      </section>

      <section aria-label="By category" className="flex flex-col gap-2">
        <h2 className="font-semibold">By category</h2>
        <ul aria-label="By category" className="divide-y rounded-lg border">
          {r.byCategory.map((c) => (
            <li key={c.key}>
              <Link
                href={withQuery(base, { cat: c.key })}
                scroll={false}
                aria-current={r.cat === c.key ? "true" : undefined}
                className="hover:bg-muted/40 flex min-h-11 flex-col gap-1.5 px-3 py-2.5"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{c.label}</span>
                  <Amount poisha={c.amount} className="font-medium" />
                </span>
                <span className="flex items-center gap-3">
                  <span aria-hidden className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, c.share ?? 0))}%` }}
                    />
                  </span>
                  <span className="text-muted-foreground w-12 text-right text-sm tabular-nums">
                    {c.share == null ? "—" : `${c.share}%`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Entries" className="flex flex-col gap-2">
        <h2 className="font-semibold">Entries</h2>
        <ul aria-label="Entries" className="divide-y rounded-lg border lg:hidden">
          {r.rows.map((row) => (
            <li key={row.id} className="px-3">
              <Link
                href={entryHref(base, row.id)}
                scroll={false}
                className="flex min-h-11 flex-col gap-0.5 py-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-medium">{formatDate(row.date)}</span>
                  <Amount poisha={row.amount} className="font-medium" />
                </span>
                {row.tagged && <ForMonth row={row} />}
                <span className="text-muted-foreground text-sm">
                  {details(row, name, notes).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border lg:block">
          <table aria-label="Entries" className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">Paid from</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {r.rows.map((row) => (
                <tr key={row.id} className={rowClass}>
                  <td className="px-3 py-2">
                    <Link
                      href={entryHref(base, row.id)}
                      scroll={false}
                      className={cn("text-primary", rowLinkClass)}
                    >
                      {formatDate(row.date)}
                    </Link>
                    {row.tagged && <ForMonth row={row} />}
                  </td>
                  <td className="px-3 py-2">{costLabel(row)}</td>
                  <td className="px-3 py-2">{paidFromLabel(row, name)}</td>
                  <td className="px-3 py-2">{noteOf(row, notes)}</td>
                  <td className="px-3 py-2 text-right">
                    <Amount poisha={row.amount} />
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="px-3 py-2" colSpan={4}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">
                  <Amount poisha={r.total} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {r.tagged && <p className="text-muted-foreground text-sm">{viewHelp.expenseStatement}</p>}
    </div>
  );
}

/** D-080: the expenses dated in another month that this month's profit counts, each a link. */
function Elsewhere({ report: r, base }: { report: ExpenseReport; base: string }) {
  const note = elsewhereNote(r);
  if (!note || !r.elsewhere) return null;
  return (
    <div className="text-muted-foreground mt-2 text-sm">
      <p>{note}</p>
      <ul aria-label="Dated in another month">
        {r.elsewhere.rows.map((row) => (
          <li key={row.id}>
            <Link
              href={entryHref(base, row.id)}
              scroll={false}
              className="text-primary inline-flex min-h-11 items-center gap-1"
            >
              {elsewhereLine(row)} <Amount poisha={row.amount} /> ›
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ForMonth({ row }: { row: CostRow }) {
  return (
    <span className="flex">
      <span className={PILL}>for {formatMonth(row.forMonth)}</span>
    </span>
  );
}

/** A phone row's second line: Category · Paid from · Note. */
const details = (row: CostRow, name: (id: string) => string, notes: Record<string, string>) =>
  [costLabel(row), paidFromLabel(row, name), noteOf(row, notes)].filter(Boolean);
