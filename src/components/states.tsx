import { Skeleton } from "@/components/ui/skeleton";

// UIDD §5: empty states (a short hint with a primary action) and loading skeleton rows.

export function EmptyState({ hint, children }: { hint: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-muted-foreground text-sm">{hint}</p>
      {children}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      <Skeleton className="h-7 w-40" />
      <div className="divide-y rounded-lg border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 px-3 py-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
