import Link from "next/link";
import { Amount } from "@/components/amount";
import { EmptyState } from "@/components/states";
import { formatDate, formatMonth } from "@/lib/dates";
import type { CardMove, EmiPlan } from "@/lib/engine/cards";
import { entryHref } from "@/lib/href";
import { cn } from "@/lib/utils";

// UIDD §4.8 (task 4.4.2): a card's charges and credits (newest first; a charge shows its bill)
// and its EMI plans (item, total, n months, billed so far, remaining). A row opens the entry over
// the card page (`base`, D-032). D-058: a reversed entry and its reversal are greyed, on no bill.

type Labelled<T> = T & { label: string };

/** `emi`: an EMI charge's "EMI 5 × ৳4,347.33 · from Nov 2026" (D-032), shown instead of its
 * bill. */
export function CardMoves({
  moves,
  base,
}: {
  moves: (Labelled<CardMove> & { emi?: string })[];
  base: string;
}) {
  if (moves.length === 0) return <EmptyState hint="No charges or credits yet." />;
  return (
    <ul aria-label="Charges and credits" className="divide-y rounded-lg border">
      {moves.map((m, i) => (
        <li key={`${m.entryId}-${i}`} className="px-3">
          <Link
            href={entryHref(base, m.entryId)}
            scroll={false}
            className={cn(
              "grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2",
              (m.reversed || m.reversal) && "text-muted-foreground",
            )}
          >
            <span className="font-medium">{m.label}</span>
            <Amount
              poisha={m.amount}
              className={cn(
                "text-right font-medium",
                (m.reversed || m.reversal) && "text-muted-foreground",
              )}
            />
            <span className="text-muted-foreground text-sm">{formatDate(m.date)}</span>
            <span className="text-muted-foreground text-right text-sm">
              <MoveNote move={m} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The row's note: its EMI, its bill, "Credit", a Reversed tag, or "Cancels the original". */
function MoveNote({ move: m }: { move: CardMove & { emi?: string } }) {
  if (m.reversal) return "Cancels the original";
  if (m.reversed)
    return (
      <>
        {m.amount < 0 ? "Credit" : "Charge"}{" "}
        <span className="bg-muted text-foreground rounded px-1.5 text-xs">Reversed</span>
      </>
    );
  return m.emi ?? (m.billMonth ? `Charge · ${formatMonth(m.billMonth)} bill` : "Credit");
}

export function EmiPlans({ plans, base }: { plans: Labelled<EmiPlan>[]; base: string }) {
  if (plans.length === 0) return <EmptyState hint="No EMI plans." />;
  return (
    <ul aria-label="EMI plans" className="divide-y rounded-lg border">
      {plans.map((p) => (
        <li key={p.entryId} className="px-3">
          <Link
            href={entryHref(base, p.entryId)}
            scroll={false}
            className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
          >
            <span className="font-medium">{p.label}</span>
            <Amount poisha={p.total} className="text-right font-medium" />
            <span className="text-muted-foreground text-sm">
              {formatDate(p.date)} · {p.months} months
            </span>
            <span className="text-muted-foreground text-right text-sm">
              Billed <Amount poisha={p.billed} /> · Remaining <Amount poisha={p.remaining} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
