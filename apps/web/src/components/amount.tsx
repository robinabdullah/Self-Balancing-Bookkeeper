import { format } from "@mbl/domain/money";
import { cn } from "@/lib/utils";

// UIDD §2: money as ৳ with Indian grouping; a negative amount is red with a minus sign.
export function Amount({ poisha, className }: { poisha: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", poisha < 0 && "text-destructive", className)}>
      {format(poisha)}
    </span>
  );
}
