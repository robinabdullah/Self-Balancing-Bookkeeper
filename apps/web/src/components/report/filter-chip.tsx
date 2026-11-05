import Link from "next/link";
import { XIcon } from "lucide-react";

// UI rule 3 (D-040, D-080): a chip for what a page is narrowed to ("01 Oct – 31 Oct 2026 ✕",
// "Rent ✕"); ✕ clears it. It appears only while the filter is set.
export function FilterChip({
  label,
  clear,
  clearLabel,
}: {
  label: string;
  clear: string;
  clearLabel: string;
}) {
  return (
    <span className="bg-muted inline-flex min-h-11 items-center gap-1 rounded-full pl-4 text-sm font-medium">
      {label}
      <Link
        href={clear}
        scroll={false}
        aria-label={clearLabel}
        className="hover:bg-background/60 flex size-11 items-center justify-center rounded-full"
      >
        <XIcon className="size-4" aria-hidden />
      </Link>
    </span>
  );
}
