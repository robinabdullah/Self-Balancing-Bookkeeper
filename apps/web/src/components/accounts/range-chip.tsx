import { FilterChip } from "@/components/report/filter-chip";
import { formatRange } from "@mbl/domain/dates";

// D-040: the period an account page's statement shows ("01 Oct – 31 Oct 2026 ✕"); ✕ clears it.
// It appears only while a period is set (UI rule 3).
export function RangeChip({ from, to, clear }: { from: string; to: string; clear: string }) {
  return (
    <p className="mt-4 flex">
      <FilterChip label={formatRange(from, to)} clear={clear} clearLabel="Clear the period" />
    </p>
  );
}
