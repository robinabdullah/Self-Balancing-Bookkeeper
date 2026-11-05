import Link from "next/link";
import { cn } from "@/lib/utils";

// UIDD §4.17: a ‹ / › step of a report's stepper (the Cash book's day, the Expense statement's
// month). No `href`: the step is greyed out (not past today, not before the first entry).
export function Step({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = "flex size-11 items-center justify-center rounded-lg";
  return href ? (
    <Link href={href} aria-label={label} className={cn(cls, "hover:bg-muted")}>
      {children}
    </Link>
  ) : (
    <span aria-hidden className={cn(cls, "text-muted-foreground/50")}>
      {children}
    </span>
  );
}
