import Link from "next/link";
import { cn } from "@/lib/utils";

// UIDD §3, §4.8, §4.17: one row of segmented links (the Accounts tabs, a customer's Statement /
// Bills, the Charts tabs). The current one is `aria-current="page"`.
export type Segment = { href: string; label: string; current: boolean };

// Static class names, so Tailwind sees them.
const COLS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

export function SegmentedNav({
  label,
  items,
  className,
}: {
  label: string;
  items: Segment[];
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("bg-muted grid gap-1 rounded-lg p-1", COLS[items.length], className)}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          className={cn(
            "text-foreground/75 flex min-h-11 items-center justify-center rounded-md text-sm",
            item.current && "bg-background text-foreground font-medium shadow-sm",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
