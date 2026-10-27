import type { EffectRow } from "@mbl/domain/effect-rows";
import { cn } from "@/lib/utils";

// D-061 (UIDD §3, §4.10, §5): label · amount rows, with a muted sub-line under the label. The
// forms' "What this will do", the confirm sheets and the Journal entry all draw them here.

export function EffectRows({
  rows,
  label,
  className,
  wrap = false,
}: {
  rows: EffectRow[];
  label?: string;
  className?: string;
  /** Let a long value wrap (History's "old → new"); amounts stay on one line. */
  wrap?: boolean;
}) {
  return (
    <dl aria-label={label} className={cn("bg-background divide-y rounded-lg border", className)}>
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="flex items-start justify-between gap-4 px-3 py-2">
          <dt>
            <span>{r.label}</span>
            {r.sub && <span className="text-muted-foreground block text-sm">{r.sub}</span>}
          </dt>
          <dd
            className={cn(
              "text-right font-medium tabular-nums",
              wrap ? "min-w-0 break-words" : "whitespace-nowrap",
            )}
          >
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
