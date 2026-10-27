"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockIcon, SlidersHorizontalIcon } from "lucide-react";
import { Amount } from "@/components/amount";
import { DMY_ERROR, DateInput } from "@/components/forms/date-fields";
import { inputClass } from "@/components/forms/field";
import { PickerField } from "@/components/forms/picker";
import { InfoNote } from "@/components/info-note";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SHEET_POP, replaceUrl } from "@/components/ui/use-back-close";
import { formatDate, formatMonth, monthOf } from "@mbl/domain/dates";
import { entryHref, withQuery } from "@mbl/domain/href";
import {
  type JournalFilter,
  NO_FILTER,
  activeCount,
  filteredTotal,
  matches,
  periodOptions,
  rangeError,
  toQuery,
} from "@mbl/domain/journal-filter";
import { format } from "@mbl/domain/money";
import { cn } from "@/lib/utils";
import type { JournalRow } from "@/api/contract";
import { TYPE_LABEL, entryTitle, whoOf } from "@mbl/domain/journal/labels";

// UIDD §4.10 (task 3.8.1, D-032): every entry, newest first, as stacked cards on a phone and a
// table-like grid on desktop. Filters (a bottom sheet on a phone), kept in the URL: type, who (a
// searchable picker), period (all time, this / last month, a month, a custom range) and search
// (label, who, note). With one type filtered the count line shows the total. 🔒 on locked rows; a
// reversed row links to its reversal and back. A row opens over the Journal, filters kept.

const PERIOD_NOTE =
  "A month also lists entries marked “for” that month, e.g. September’s salary paid on 5 October.";

type Props = {
  rows: JournalRow[];
  names: Record<string, string>;
  /** The counterparties to filter by (active or not), with their kind as the hint. */
  people: { id: string; label: string; hint: string }[];
  /** The filter from the URL. */
  initial: JournalFilter;
  /** Today (Dhaka) and the first month with entries: the Period choices. */
  today: string;
  firstMonth: string | null;
};

export function JournalList({ rows, names, people, initial, today, firstMonth }: Props) {
  const [filter, setFilterState] = useState<JournalFilter>(initial);
  const [sheet, setSheet] = useState(false);
  const [reset, setReset] = useState(0); // remounts the Who picker on Clear
  // The URL follows the filters without a server round trip (Next keeps its router in step with
  // `history.replaceState`), so a reload or a shared link shows the same list.
  const setFilter = (f: JournalFilter) => {
    setFilterState(f);
    replaceUrl(withQuery("/journal", toQuery(f)));
  };
  const base = withQuery("/journal", toQuery(filter));
  // D-035: closing a sheet (Filters, the Who picker) goes back to the history entry from before it
  // opened, which has the old query; put the filters shown back in the URL.
  useEffect(() => {
    const sync = () => {
      const entry = new URLSearchParams(window.location.search).get("entry"); // an open entry stays
      replaceUrl(entry ? entryHref(base, entry) : base);
    };
    window.addEventListener(SHEET_POP, sync);
    return () => window.removeEventListener(SHEET_POP, sync);
  }, [base]);
  const clear = () => {
    setFilter(NO_FILTER);
    setReset((n) => n + 1);
  };
  const text = (r: JournalRow) => `${entryTitle(r)} ${whoOf(r, names)} ${r.note}`;
  const shown = rows.filter((r) => matches(r, filter, today, text(r)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const active = activeCount(filter);
  const total = filteredTotal(shown, filter);
  const entries = `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`;
  const fields = (
    <Filters
      key={reset}
      filter={filter}
      onChange={setFilter}
      people={people}
      periods={periodOptions(firstMonth, today)}
    />
  );
  const count = (
    <p className="text-muted-foreground text-sm" role="status">
      {entries}
      {total != null && (
        <>
          {" · total "}
          <Amount poisha={total} />
        </>
      )}
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 lg:hidden">
        {count}
        <Button variant="outline" className="min-h-11" onClick={() => setSheet(true)}>
          <SlidersHorizontalIcon />
          Filters{active ? ` (${active})` : ""}
        </Button>
      </div>
      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[90dvh] gap-0 rounded-t-xl lg:hidden">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription className="sr-only">Filter the journal</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {fields}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="min-h-11" onClick={clear} disabled={!active}>
                Clear
              </Button>
              <Button className="min-h-11" onClick={() => setSheet(false)}>
                Show {entries}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <section aria-label="Filters" className="hidden flex-col gap-2 lg:flex">
        <div
          className={cn(
            "grid items-start gap-3",
            filter.period === "custom" ? "grid-cols-6" : "grid-cols-4",
          )}
        >
          {fields}
        </div>
        <div className="flex min-h-11 items-center justify-between gap-2">
          {count}
          {active > 0 && (
            <Button variant="ghost" className="min-h-11" onClick={clear}>
              Clear filters
            </Button>
          )}
        </div>
      </section>

      {shown.length === 0 ? (
        <EmptyState hint={rows.length ? "No entries match these filters." : "No entries yet."}>
          {active > 0 && (
            <Button variant="outline" className="min-h-11" onClick={clear}>
              Clear filters
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul aria-label="Entries" className="divide-y rounded-lg border">
          {shown.map((row) => (
            <Row key={row.id} row={row} names={names} byId={byId} base={base} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  row,
  names,
  byId,
  base,
}: {
  row: JournalRow;
  names: Record<string, string>;
  byId: Map<string, JournalRow>;
  base: string;
}) {
  const who = whoOf(row, names);
  const link = (id: string, text: string) => {
    const other = byId.get(id);
    return (
      <Link
        href={entryHref(base, id)}
        scroll={false}
        className="text-primary inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
      >
        {text} {other ? formatDate(other.date) : ""}
      </Link>
    );
  };
  return (
    <li className="px-3">
      <Link
        href={entryHref(base, row.id)}
        scroll={false}
        className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2 lg:grid-cols-[7rem_1fr_1fr_auto_6rem] lg:items-center"
      >
        <span className="text-muted-foreground col-start-1 row-start-2 text-sm lg:col-auto lg:row-auto">
          {formatDate(row.date)}
          {row.forMonth &&
            monthOf(row.date) !== row.forMonth &&
            ` · for ${formatMonth(row.forMonth)}`}
        </span>
        <span className="col-start-1 row-start-1 font-medium lg:col-auto lg:row-auto">
          {entryTitle(row)}
        </span>
        <span className="text-muted-foreground col-span-2 col-start-1 row-start-3 truncate text-sm lg:col-auto lg:col-span-1 lg:row-auto">
          {who}
          {row.note && (
            <span className="lg:hidden">
              {who ? " · " : ""}
              {row.note}
            </span>
          )}
        </span>
        <span className="col-start-2 row-start-1 text-right font-medium tabular-nums lg:col-auto lg:row-auto">
          {format(row.amount)}
        </span>
        <span className="col-start-2 row-start-2 flex justify-end gap-1 lg:col-auto lg:row-auto">
          {row.locked && (
            <span className="bg-muted inline-flex items-center gap-1 rounded px-1.5 text-xs">
              <LockIcon className="size-3" aria-hidden /> Locked
            </span>
          )}
          {row.reversesId && <span className="bg-muted rounded px-1.5 text-xs">Reversal</span>}
          {row.reversedBy && <span className="bg-muted rounded px-1.5 text-xs">Reversed</span>}
        </span>
      </Link>
      {row.reversedBy && (
        <div className="-mt-2">{link(row.reversedBy, "Reversed by entry of")}</div>
      )}
      {row.reversesId && <div className="-mt-2">{link(row.reversesId, "Reverses entry of")}</div>}
    </li>
  );
}

function Filters({
  filter,
  onChange,
  people,
  periods,
}: {
  filter: JournalFilter;
  onChange: (f: JournalFilter) => void;
  people: Props["people"];
  periods: [string, string][];
}) {
  const [bad, setBad] = useState({ from: false, to: false });
  const set =
    (key: keyof JournalFilter) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...filter, [key]: e.target.value });
  // Each label row is 44px tall, like the Who picker's and Period's (they have an ⓘ / tap target),
  // so the four controls line up.
  const field = (label: string, control: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      <span className="flex min-h-11 items-center">{label}</span>
      {control}
    </label>
  );
  // D-035: dd/mm/yyyy; the URL changes only once a full, valid date is typed (or the box is cleared).
  const dateInput = (key: "from" | "to") => (
    <DateInput
      value={filter[key]}
      onChange={(d) => d !== null && onChange({ ...filter, [key]: d })}
      onBadChange={(b) => setBad((s) => ({ ...s, [key]: b }))}
      aria-invalid={rangeError(filter) || bad[key]}
    />
  );
  return (
    <>
      {field(
        "Type",
        <select className={inputClass} value={filter.type} onChange={set("type")}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>,
      )}
      <PickerField
        label="Who"
        name="who"
        placeholder="Everyone"
        defaultValue={filter.who}
        options={[{ id: "", label: "Everyone" }, ...people]}
        onChange={(who) => onChange({ ...filter, who })}
      />
      <div className="flex flex-col gap-1">
        <div className="flex min-h-11 items-center text-sm font-medium">
          <InfoNote label="Period" note={PERIOD_NOTE} />
        </div>
        <select
          aria-label="Period"
          className={inputClass}
          value={filter.period}
          onChange={(e) => onChange({ ...filter, period: e.target.value, from: "", to: "" })}
        >
          {periods.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {filter.period === "custom" && (
        <>
          {field("From", dateInput("from"))}
          {field("To", dateInput("to"))}
        </>
      )}
      {field(
        "Search",
        <input
          type="search"
          className={inputClass}
          placeholder="Note, name or type"
          value={filter.q}
          onChange={set("q")}
        />,
      )}
      {filter.period === "custom" && (bad.from || bad.to) && (
        <p role="alert" className="text-destructive text-sm lg:col-span-full">
          {DMY_ERROR}.
        </p>
      )}
      {rangeError(filter) && (
        <p role="alert" className="text-destructive text-sm lg:col-span-full">
          From is after To.
        </p>
      )}
    </>
  );
}
