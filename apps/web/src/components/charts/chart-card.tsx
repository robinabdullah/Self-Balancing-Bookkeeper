import type { ReactNode } from "react";
import Link from "next/link";
import { format } from "@/lib/money";

// D-064 (UIDD §4.17): a chart card is one link to its detail page: the title, one headline
// figure, a muted delta with an arrow (never red or green) and a mini chart without text, hidden
// from screen readers (the link's text says what it is).

/** "vs prev 6M" (flows) or "since 01 May" (positions); null: no delta. */
export type Delta = { amount: number; note: string } | null;

export function ChartCard({
  href,
  title,
  headline,
  delta,
  note,
  children,
}: {
  href: string;
  title: string;
  /** Already formatted: "৳1,20,000", "৳4,50,000 · 12.5%". */
  headline: string;
  delta?: Delta;
  /** A muted line in the delta's place, without a figure ("as of today"). */
  note?: string;
  /** The mini chart. */
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted/40 flex min-w-0 flex-col gap-1 rounded-lg border p-3"
    >
      <span className="text-muted-foreground text-sm">{title}</span>
      <span className="text-lg font-semibold tabular-nums">{headline}</span>
      {delta && (
        <span className="text-muted-foreground text-xs tabular-nums">
          {delta.amount !== 0 && (
            <>
              <span aria-hidden>{delta.amount > 0 ? "▲ " : "▼ "}</span>
              <span className="sr-only">{delta.amount > 0 ? "up " : "down "}</span>
            </>
          )}
          {format(Math.abs(delta.amount))} {delta.note}
        </span>
      )}
      {note && <span className="text-muted-foreground text-xs">{note}</span>}
      {children && (
        <span aria-hidden className="mt-1 block min-w-0">
          {children}
        </span>
      )}
    </Link>
  );
}
