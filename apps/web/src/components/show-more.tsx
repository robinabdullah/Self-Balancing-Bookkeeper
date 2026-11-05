"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PAGE, visibleRows } from "@mbl/domain/show-more";

// D-077 (UIDD §1): a long list shows the newest 25 rows, then one footer row: grey "Showing 25 of
// N" (announced) on the left, an outline **Show 25 more** on the right (gone once all are shown).
// After a tap, focus moves to the first new row: mark each row with `data-row={i}`; of the marked
// rows only the visible one is used (a statement has a phone list and a desktop table).

export type ShowMoreList<T> = ReturnType<typeof visibleRows<T>> & {
  total: number;
  /** A period's list: every row, no footer. */
  whole: boolean;
  more: () => void;
};

/** `whole`: a list bounded by a period shows every row (no footer). */
export function useShowMore<T>(rows: T[], whole = false) {
  const [n, setN] = useState(PAGE);
  const list: ShowMoreList<T> = {
    ...visibleRows(rows, whole ? rows.length : n),
    total: rows.length,
    whole,
    more: () => setN((m) => m + PAGE),
  };
  return { list, reset: () => setN(PAGE) };
}

export function ShowMore<T>({
  list,
  className,
  children,
}: {
  list: ShowMoreList<T>;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusAt = useRef<number | null>(null); // the first new row, after a tap
  const count = list.shown.length;
  useEffect(() => {
    const at = focusAt.current;
    if (at == null || at >= count) return;
    focusAt.current = null;
    const rows = ref.current?.querySelectorAll<HTMLElement>(`[data-row="${at}"]`) ?? [];
    const row = [...rows].find((r) => r.offsetParent !== null);
    (row?.querySelector<HTMLElement>("a, button") ?? row)?.focus();
  }, [count]);
  return (
    <div ref={ref} className={className ?? "flex flex-col gap-2"}>
      {children}
      {!list.whole && list.total > PAGE && (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p aria-live="polite" className="text-muted-foreground text-sm">
            Showing {list.shown.length} of {list.total}
          </p>
          {list.next > 0 && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                focusAt.current = count;
                list.more();
              }}
            >
              Show {list.next} more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
