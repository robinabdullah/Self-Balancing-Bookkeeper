"use client";

import { useState } from "react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import { BankBadge } from "@/components/cards/bank-badge";
import { inputClass } from "@/components/forms/field";
import { InfoNote } from "@/components/info-note";
import { EmptyState } from "@/components/states";
import { rowClass, rowLinkClass } from "@/components/tables/row-link";
import { Button } from "@/components/ui/button";
import { type CardRow, type OwnerGroup, STATUS, groupByOwner, searchCards } from "@/lib/card-view";
import type { CardStatus } from "@/lib/engine/cards";
import { formatDate } from "@/lib/dates";
import { viewHelp } from "@/lib/help-text";
import { cardTitle } from "@/lib/setup";
import { cn } from "@/lib/utils";

// UIDD §4.8 (task 4.4.1): the Cards summary, mirroring Nadim's Summary. At ≥ 1024px the full
// table; on a phone a stacked card each: the card (D-022), next due + amount, status badge.
// A row opens the card's detail. D-056: a search box, and the cards grouped under their owner,
// whose heading counts them and adds up their balance; so the rows name only the card.

export function StatusBadge({ status }: { status: CardStatus }) {
  const { label, tone } = STATUS[status];
  return (
    <span
      className={cn("rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone)}
    >
      {label}
    </span>
  );
}

const nextDueText = (r: CardRow) => (r.nextDue ? formatDate(r.nextDue.date) : "—");
const href = (r: CardRow) => `/cards/${r.id}`;
/** "Arif · 6 cards", or under a search "Arif · 1 of 6 cards". */
const heading = (g: OwnerGroup) =>
  `${g.owner} · ${g.rows.length === g.of ? "" : `${g.rows.length} of `}${g.of} ${g.of === 1 ? "card" : "cards"}`;

export function CardList({ rows }: { rows: CardRow[] }) {
  const [search, setSearch] = useState("");
  if (rows.length === 0)
    return (
      <EmptyState hint="No cards yet. Add one in Setup.">
        <Button asChild className="min-h-11">
          <Link href="/setup">Setup</Link>
        </Button>
      </EmptyState>
    );
  const groups = groupByOwner(searchCards(rows, search), rows);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Search owner or card
        <input
          type="search"
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {groups.length === 0 ? (
        <EmptyState hint="No card matches this search." />
      ) : (
        <>
          <Phone groups={groups} />
          <Desktop groups={groups} />
        </>
      )}
    </div>
  );
}

function Phone({ groups }: { groups: OwnerGroup[] }) {
  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {groups.map((g) => (
        <section key={g.ownerId} aria-label={g.owner} className="rounded-lg border">
          <h2 className="bg-muted/40 flex min-h-11 items-center justify-between gap-3 rounded-t-lg px-3 py-2 font-medium">
            <span>{heading(g)}</span>
            <span className="text-right text-sm">
              Balance <Balance poisha={g.balance} />
            </span>
          </h2>
          <ul aria-label={`${g.owner}'s cards`} className="divide-y border-t">
            {g.rows.map((r) => (
              <li key={r.id} className="px-3">
                <Link
                  href={href(r)}
                  className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2"
                >
                  <span className="grid grid-cols-[auto_1fr] items-start gap-2 font-medium">
                    <BankBadge name={r.name} className="mt-0.5" />
                    <span>
                      {cardTitle(r.name, r.network)}
                      {!r.active && <Inactive />}
                    </span>
                  </span>
                  <span className="text-right">
                    <StatusBadge status={r.status} />
                  </span>
                  <span className="text-muted-foreground text-sm">Next due {nextDueText(r)}</span>
                  <span className="text-right text-sm font-medium">
                    {r.nextDue && <Amount poisha={r.nextDue.amount} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Desktop({ groups }: { groups: OwnerGroup[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border lg:block">
      <table aria-label="Cards" className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground text-left align-top">
          <tr>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 text-right font-medium">Stmt day</th>
            <th className="px-3 py-2 text-right font-medium">Due day</th>
            <th className="px-3 py-2 text-right font-medium">Balance</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
              <InfoNote label="Available ≈" note={viewHelp.available} />
            </th>
            <th className="px-3 py-2 font-medium">Next due</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
            <th className="px-3 py-2 text-right font-medium">Overdue</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.ownerId} className="divide-y border-t">
            <tr className="bg-muted/40 font-medium">
              <th scope="rowgroup" colSpan={3} className="px-3 py-2 text-left">
                {heading(g)}
              </th>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <Balance poisha={g.balance} />
              </td>
              <td colSpan={5} />
            </tr>
            {g.rows.map((r) => (
              <tr key={r.id} className={rowClass}>
                <td className="px-3 py-2">
                  <Link
                    href={href(r)}
                    className={cn("text-primary inline-flex items-center gap-2", rowLinkClass)}
                  >
                    <BankBadge name={r.name} />
                    {cardTitle(r.name, r.network)}
                  </Link>
                  {!r.active && <Inactive />}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.statementDay}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.dueDay}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Balance poisha={r.balance} />
                </td>
                <td className="px-3 py-2 text-right">
                  {r.available != null && <Amount poisha={r.available} />}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{nextDueText(r)}</td>
                <td className="px-3 py-2 text-right">
                  {r.nextDue && <Amount poisha={r.nextDue.amount} />}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.overdue > 0 && <Amount poisha={r.overdue} className="text-destructive" />}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** A card's balance; below 0 it is card credit (SRS §6.6), shown as such, not as a red minus. */
function Balance({ poisha }: { poisha: number }) {
  if (poisha >= 0) return <Amount poisha={poisha} />;
  return (
    <span className="text-sky-800 dark:text-sky-300">
      Credit <Amount poisha={0 - poisha} />
    </span>
  );
}

function Inactive() {
  return (
    <span className="bg-muted ml-2 rounded-full border px-2 py-0.5 text-xs font-normal">
      Inactive
    </span>
  );
}
