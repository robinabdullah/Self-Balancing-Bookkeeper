import Link from "next/link";
import { RangeChip } from "@/components/accounts/range-chip";
import { type ChartPeriod, PERIODS } from "@/lib/charts/period";
import { withQuery } from "@/lib/href";
import { cn } from "@/lib/utils";

// D-064 (UIDD §4.17): the Charts period row: 6M (default) · 12M · This year · Custom. Custom opens
// the Report sheet (View on screen only); a custom range also shows the range chip (✕ → 6M).

export function PeriodChips({
  path,
  current,
  period,
}: {
  /** The page and tab, without a period. */
  path: string;
  /** This page as shown (with its period), for the Report sheet. */
  current: string;
  period: ChartPeriod;
}) {
  const chip = (href: string, label: string, on: boolean) => (
    <Link
      key={label}
      href={href}
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center rounded-full border px-4 text-sm",
        on ? "bg-primary text-primary-foreground border-primary font-medium" : "hover:bg-muted/40",
      )}
    >
      {label}
    </Link>
  );
  return (
    <>
      <nav aria-label="Period" className="mt-3 flex flex-wrap gap-2">
        {PERIODS.map(([key, label]) =>
          chip(withQuery(path, { period: key === "6m" ? null : key }), label, period.key === key),
        )}
        {chip(withQuery(current, { report: "1" }), "Custom", period.key === "custom")}
      </nav>
      {period.key === "custom" && <RangeChip from={period.from} to={period.to} clear={path} />}
    </>
  );
}
