import Link from "next/link";
import { XIcon } from "lucide-react";
import { formatRange } from "@/lib/dates";

// D-040: the period an account page's statement shows ("01 Oct – 31 Oct 2026 ✕"); ✕ clears it.
// It appears only while a period is set (UI rule 3).
export function RangeChip({ from, to, clear }: { from: string; to: string; clear: string }) {
  return (
    <p className="mt-4 flex">
      <span className="bg-muted inline-flex min-h-11 items-center gap-1 rounded-full pl-4 text-sm font-medium">
        {formatRange(from, to)}
        <Link
          href={clear}
          scroll={false}
          aria-label="Clear the period"
          className="hover:bg-background/60 flex size-11 items-center justify-center rounded-full"
        >
          <XIcon className="size-4" aria-hidden />
        </Link>
      </span>
    </p>
  );
}
