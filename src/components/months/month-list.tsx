import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { Amount } from "@/components/amount";
import { formatMonth } from "@/lib/dates";
import type { MonthListRow } from "@/lib/months-view";

// UIDD §4.9 (task 5.1): the Months list, newest first: month, profit, status (Open / Closed on
// dd Mon). The next month to close opens its close screen; a closed month, its snapshot (5.2); a
// later open month up to this month, its read-only view (D-044).

export function MonthList({ rows }: { rows: MonthListRow[] }) {
  return (
    <ul aria-label="Months" className="divide-y rounded-lg border lg:max-w-2xl">
      {rows.map((m) => {
        const body = (
          <>
            <span className="font-medium">{formatMonth(m.month)}</span>
            <Amount poisha={m.profit} className="text-right font-medium" />
            <span className="text-muted-foreground text-sm">{m.status}</span>
            <span className="text-primary text-right text-sm">
              {m.link && (
                <span className="inline-flex items-center">
                  {m.next ? "Close month" : "View"}{" "}
                  <ChevronRightIcon aria-hidden className="size-4" />
                </span>
              )}
            </span>
          </>
        );
        const grid = "grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2";
        return (
          <li key={m.month} className="px-3">
            {m.link ? (
              <Link href={`/months/${m.month}`} className={grid}>
                {body}
              </Link>
            ) : (
              <div className={grid}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
