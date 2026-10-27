"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { Amount } from "@/components/amount";
import { type Breakdown, type PositionSection, positionSections } from "@mbl/domain/dashboard";
import { format } from "@mbl/domain/money";
import { cn } from "@/lib/utils";
import { NavSheet } from "./nav-sheets";

// UIDD §3 (task 4.1.4, D-064): the books-balance chip. ✓ Balanced / ✗ Off by ৳X; tapping it opens
// the Books balance sheet: Net worth on top, then what we have, what we owe and whose it is (SRS
// §5). A ✗ means an engine bug or an opening data error.
export function BalanceChip({ balance }: { balance: Breakdown }) {
  const ok = balance.difference === 0;
  const off = format(Math.abs(balance.difference));
  const status = (
    <>
      {ok ? <CheckIcon className="size-4" aria-hidden /> : <XIcon className="size-4" aria-hidden />}
      {ok ? "Balanced" : `Off by ${off}`}
    </>
  );
  const tone = ok
    ? "border-emerald-600/40 text-emerald-700 dark:text-emerald-400"
    : "border-destructive text-destructive";
  return (
    <NavSheet
      title="Books balance"
      description="Both sides of the books"
      triggerClass={cn(
        "flex min-h-11 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
        tone,
      )}
      trigger={status}
    >
      <section
        aria-label="Net worth"
        className="bg-muted flex items-center justify-between gap-3 rounded-lg p-3"
      >
        <div className="flex flex-col">
          <span className="text-sm font-medium">Net worth</span>
          <Amount poisha={balance.netAssets} className="text-2xl font-semibold" />
        </div>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
            tone,
          )}
        >
          {status}
        </span>
      </section>
      {positionSections(balance).map((s) => (
        <Side key={s.title} section={s} />
      ))}
      <p className={cn("py-3 text-sm", ok ? "text-muted-foreground" : "text-destructive")}>
        {ok
          ? "✓ Net worth matches “Whose it is”: every taka is accounted for."
          : `✗ Off by ${off}: net worth is ${off} ${balance.difference > 0 ? "more" : "less"} than “Whose it is”. This is a data error, so tell the developer.`}
      </p>
    </NavSheet>
  );
}

function Side({ section: { title, lines, totals } }: { section: PositionSection }) {
  return (
    <section aria-label={title} className="pt-3">
      <h3 className="text-muted-foreground pb-1 text-sm">{title}</h3>
      <dl className="divide-y">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3 py-1.5 text-sm">
            <dt>{l.label}</dt>
            <dd>
              <Amount poisha={l.amount} />
            </dd>
          </div>
        ))}
        {totals.map((t) => (
          <div key={t.label} className="flex justify-between gap-3 py-1.5 font-semibold">
            <dt>{t.label}</dt>
            <dd>
              <Amount poisha={t.amount} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
