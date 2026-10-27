import Link from "next/link";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import { StatusBadge } from "@/components/cards/card-list";
import { EmptyState } from "@/components/states";
import type { StatementLine } from "@/lib/accounts";
import type { CardRow } from "@/lib/card-view";
import { formatDate, formatMonth } from "@/lib/dates";
import type { Allocation } from "@/lib/engine/months";
import { entryHref } from "@/lib/href";
import { format } from "@/lib/money";

// UIDD §4.8 (task 4.5): a person's cards ("Owner · Card", D-022) with their business balances,
// profit allocated per closed month, and the entries that moved their profit owed (paid,
// reinvested, opening). A row opens the card or the entry.

const KIND: Record<Allocation["kind"], string> = {
  cash: "Cash investment",
  card: "Card investment",
  partner: "Partner share",
};

export function CardsSupplied({ cards }: { cards: CardRow[] }) {
  if (cards.length === 0) return <EmptyState hint="No cards." />;
  return (
    <ul aria-label="Cards supplied" className="divide-y rounded-lg border">
      {cards.map((c) => (
        <li key={c.id} className="px-3">
          <Link href={`/cards/${c.id}`} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2">
            <span className="flex items-center gap-2 font-medium">
              <BankBadge name={c.name} />
              {c.display}
            </span>
            <Amount poisha={c.balance} className="text-right font-medium" />
            <span className="text-muted-foreground text-sm">Business balance</span>
            <span className="text-right">
              <StatusBadge status={c.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Allocations({ rows }: { rows: Allocation[] }) {
  if (rows.length === 0) return <EmptyState hint="No closed months yet." />;
  return (
    <ul aria-label="Profit allocated" className="divide-y rounded-lg border">
      {rows.map((a, i) => (
        <li key={i} className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 px-3 py-2">
          <span className="font-medium">{formatMonth(a.month)}</span>
          <Amount poisha={a.amount} className="text-right font-medium" />
          <span className="text-muted-foreground col-span-2 text-sm">
            {KIND[a.kind]}
            {a.basis != null && a.ratePct != null && ` · ${format(a.basis)} × ${a.ratePct}%`}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProfitMoves({
  lines,
  base,
}: {
  lines: (StatementLine & { label: string })[];
  /** This page's URL: an entry opens over it (D-032). */
  base: string;
}) {
  if (lines.length === 0) return <EmptyState hint="No profit paid or reinvested yet." />;
  return (
    <ul aria-label="Profit paid and reinvested" className="divide-y rounded-lg border">
      {lines.map((l) => (
        <li key={l.entryId} className="px-3">
          <Link
            href={entryHref(base, l.entryId)}
            scroll={false}
            className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
          >
            <span className="font-medium">{l.label}</span>
            <Amount poisha={l.amount} className="text-right font-medium" />
            <span className="text-muted-foreground col-span-2 text-sm">{formatDate(l.date)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
