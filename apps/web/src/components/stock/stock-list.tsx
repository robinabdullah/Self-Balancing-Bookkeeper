"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { Amount } from "@/components/amount";
import { inputClass } from "@/components/forms/field";
import { DETAIL } from "@mbl/domain/journal/labels";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDate } from "@mbl/domain/dates";
import type { StockLot } from "@mbl/domain/engine/stock";
import { format } from "@mbl/domain/money";
import { type ModelStock, stockByModel } from "@mbl/domain/stock-view";
import { cn } from "@/lib/utils";
import type { LotInfo } from "@/api/contract";

// UIDD §4.7 (task 4.2, D-027): stock grouped by model; expanding a model shows its lots. Filter in
// stock (default) or all; search by model or IMEI/note. A lot is a stacked card on a phone and a
// table row at ≥ 1024px. D-063: each model row has its avg cost.

type Lot = StockLot & LotInfo;
type Props = { lots: Lot[]; names: Record<string, string> };

const units = (n: number) => `${n} ${n === 1 ? "unit" : "units"}`;

export function StockList({ lots, names }: Props) {
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState("");
  const groups = stockByModel(lots, names, { all, search });
  const total = groups.reduce((n, g) => n + g.units, 0);
  const value = groups.reduce((n, g) => n + g.value, 0);
  const sourceOf = (l: Lot) =>
    [DETAIL[l.source] ?? l.source, l.fromId && names[l.fromId]].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          Search model or IMEI/note
          <input
            type="search"
            className={inputClass}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Show" className="grid grid-cols-2 gap-2">
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              variant={all === value ? "default" : "outline"}
              aria-pressed={all === value}
              className="min-h-11"
              onClick={() => setAll(value)}
            >
              {value ? "All lots" : "In stock"}
            </Button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        lots.length === 0 ? (
          <EmptyState hint="No stock yet. A purchase adds its lots here.">
            <Button asChild className="min-h-11">
              <Link href="/purchases/new">New purchase</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState hint={search ? "No lots match this search." : "Nothing in stock."} />
        )
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {units(total)} · {format(value)} at cost
          </p>
          <div className="rounded-lg border">
            <div
              aria-hidden
              data-testid="stock-columns"
              className={cn(ROW, "text-muted-foreground hidden min-h-0 border-b text-sm lg:grid")}
            >
              <span>Model</span>
              <span className="text-right">Left</span>
              <span className="text-right">Avg cost</span>
              <span className="text-right">Value</span>
              <span className="w-4" />
            </div>
            <ul aria-label="Models" className="divide-y">
              {groups.map((g) => (
                <li key={`${g.modelId}-${!!search}`}>
                  <details open={!!search} className="group">
                    <summary
                      className={cn(
                        ROW,
                        "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
                      )}
                    >
                      <ModelCells g={g} all={all} />
                      <ChevronDownIcon
                        aria-hidden
                        className="size-4 transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <Lots lots={g.lots} sourceOf={sourceOf} />
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// D-063: a phone shows the name over "12 units · avg ৳X" ("12 left of 40 · avg ৳X" in All lots)
// and the value; ≥ 1024px lines Model · Left · Avg cost · Value up under the header row.
const ROW =
  "grid min-h-11 grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-2 lg:grid-cols-[1fr_8rem_8rem_9rem_auto]";

function ModelCells({ g, all }: { g: ModelStock<Lot>; all: boolean }) {
  const avg = all ? g.boughtAvg : g.avg;
  const left = all ? `${g.units} left of ${g.bought}` : units(g.units);
  return (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium lg:truncate">{g.name}</span>
        <span className="text-muted-foreground text-sm lg:hidden">
          {avg == null ? left : `${left} · avg ${format(avg)}`}
        </span>
      </span>
      <span
        className={cn("hidden text-right tabular-nums lg:block", g.units < 0 && "text-destructive")}
      >
        <span className="sr-only">Left </span>
        {all ? `${g.units} of ${g.bought}` : g.units}
      </span>
      <span className="hidden text-right lg:block">
        <span className="sr-only">Avg cost </span>
        {avg == null ? "—" : <Amount poisha={avg} />}
      </span>
      <Amount poisha={g.value} className="text-right font-medium" />
    </>
  );
}

const COLS = ["In", "Sold", "Returned", "To seller", "Left"] as const;
const countsOf = (l: Lot) => [l.qty, l.sold, l.returned, l.toSeller, l.remaining];

function Lots({ lots, sourceOf }: { lots: Lot[]; sourceOf: (l: Lot) => string }) {
  return (
    <>
      <ul aria-label="Lots" className="bg-muted/40 divide-y border-t lg:hidden">
        {lots.map((l) => (
          <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2 text-sm">
            <span>
              {formatDate(l.date)} · {sourceOf(l)}
            </span>
            <span className={cn("text-right font-medium", l.remaining < 0 && "text-destructive")}>
              {l.remaining} left of {l.qty}
            </span>
            <span className="text-muted-foreground">
              {COLS.slice(1, 4)
                .map((c, i) => `${c} ${countsOf(l)[i + 1]}`)
                .join(" · ")}
            </span>
            <Amount poisha={l.unitCost} className="text-right" />
            {l.imeiNote && (
              <span className="text-muted-foreground col-span-2 truncate">{l.imeiNote}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto border-t lg:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 text-right font-medium">Unit cost</th>
              {COLS.map((c) => (
                <th key={c} className="px-3 py-2 text-right font-medium">
                  {c}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">IMEI/note</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lots.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">{formatDate(l.date)}</td>
                <td className="px-3 py-2">{sourceOf(l)}</td>
                <td className="px-3 py-2 text-right">
                  <Amount poisha={l.unitCost} />
                </td>
                {countsOf(l).map((n, i) => (
                  <td
                    key={COLS[i]}
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      i === 4 && "font-medium",
                      n < 0 && "text-destructive",
                    )}
                  >
                    {n}
                  </td>
                ))}
                <td className="text-muted-foreground px-3 py-2">{l.imeiNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
