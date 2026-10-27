import Link from "next/link";
import { Amount } from "@/components/amount";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import type { CashDay } from "@mbl/domain/cash-book";
import { formatDate } from "@mbl/domain/dates";
import { entryHref } from "@mbl/domain/href";
import { cn } from "@/lib/utils";
import type { CashLabel } from "@/server/reports";

// D-043 (UIDD §4.17): one Cash book day: Opening, each entry that moved cash (in the order saved),
// Closing. At ≥ 1024px a table (Entry · Who · In · Out · Balance); on a phone one row per entry:
// the entry and who on the left, the signed amount and the balance after it on the right. A row
// opens the entry over this page (`base`, D-032).

type Props = { day: CashDay; labels: Record<string, CashLabel>; base: string; label: string };

export function CashDayView({ day, labels, base, label }: Props) {
  const title = (id: string) => labels[id]?.title ?? "Entry";
  return (
    <>
      <ul aria-label={label} className="divide-y rounded-lg border lg:hidden">
        <BalanceItem label="Opening" poisha={day.opening} />
        {day.rows.map((r) => (
          <li key={r.id} className="px-3">
            <Link
              href={entryHref(base, r.id)}
              scroll={false}
              className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
            >
              <span className="font-medium">{title(r.id)}</span>
              <span className="text-right font-medium tabular-nums">
                {r.amount > 0 ? "In " : "Out "}
                <Amount poisha={Math.abs(r.amount)} />
              </span>
              <span className="text-muted-foreground text-sm">{labels[r.id]?.who}</span>
              <span className="text-muted-foreground text-right text-sm">
                Balance <Amount poisha={r.balance} />
              </span>
            </Link>
          </li>
        ))}
        <BalanceItem label="Closing" poisha={day.closing} />
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border lg:block">
        <table aria-label={label} className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Entry</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 text-right font-medium">In</th>
              <th className="px-3 py-2 text-right font-medium">Out</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <BalanceRow label="Opening" poisha={day.opening} />
            {day.rows.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className="px-3 py-2">
                  <Link
                    href={entryHref(base, r.id)}
                    scroll={false}
                    className={cn("text-primary", rowLinkClass)}
                  >
                    {title(r.id)}
                  </Link>
                </td>
                <td className="px-3 py-2">{labels[r.id]?.who}</td>
                <td className="px-3 py-2 text-right">
                  {r.amount > 0 && <Amount poisha={r.amount} />}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.amount < 0 && <Amount poisha={0 - r.amount} />}
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  <Amount poisha={r.balance} />
                </td>
              </tr>
            ))}
            <BalanceRow label="Closing" poisha={day.closing} />
          </tbody>
        </table>
      </div>
    </>
  );
}

/** "Cash book 10 Oct 2026" (the list's and the table's accessible name). */
export const dayLabel = (date: string) => `Cash book ${formatDate(date)}`;

function BalanceItem({ label, poisha }: { label: string; poisha: number }) {
  return (
    <li className="bg-muted/40 grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 px-3 py-2 font-medium">
      <span>{label}</span>
      <Amount poisha={poisha} className="text-right" />
    </li>
  );
}

function BalanceRow({ label, poisha }: { label: string; poisha: number }) {
  return (
    <tr className="bg-muted/40 font-medium">
      <td className="px-3 py-2" colSpan={4}>
        {label}
      </td>
      <td className="px-3 py-2 text-right">
        <Amount poisha={poisha} />
      </td>
    </tr>
  );
}
