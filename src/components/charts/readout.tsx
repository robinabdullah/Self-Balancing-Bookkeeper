"use client";

import { useState } from "react";
import { Amount } from "@/components/amount";

// D-064 (UIDD §4.17): a detail chart's values. On a phone (no hover) a tap shows "{bucket}:
// {values}" in a fixed line above the chart, the latest bucket until then; on desktop (hover) the
// tooltip shows them instead. The lines are built by the page (one per row), so a server page can
// pass them. A row may also carry lines behind "See breakdown" (Net profit: the month page's).

/** Only on a device that hovers (the tooltip). */
export const HOVER_ONLY = "[@media(hover:none)]:hidden";

/** One line behind "See breakdown". */
export type DetailLine = { label: string; amount: number };

/** The picked row: the last one until a tap. */
export function useReadout(count: number) {
  const [picked, pick] = useState<number | null>(null);
  const index = picked != null && picked >= 0 && picked < count ? picked : count - 1;
  return { index, pick };
}

export function ReadoutLine({ text, detail }: { text: string | undefined; detail?: DetailLine[] }) {
  return (
    <div className="[@media(hover:hover)]:hidden">
      <p aria-live="polite" className="min-h-5 text-sm font-medium tabular-nums">
        {text}
      </p>
      {detail && detail.length > 0 && (
        <details className="text-sm">
          <summary className="text-primary flex min-h-11 cursor-pointer items-center">
            See breakdown
          </summary>
          <dl aria-label="Breakdown" className="mb-2 divide-y rounded-lg border">
            {detail.map((l) => (
              <div key={l.label} className="flex min-h-9 items-center justify-between gap-3 px-3">
                <dt>{l.label}</dt>
                <dd>
                  <Amount poisha={l.amount} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
