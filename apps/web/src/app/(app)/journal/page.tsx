import type { JournalView } from "@mbl/api/views/home.controller";
import { api } from "@/api/client";
import { EntryOverlay, preloadEntry } from "@/components/journal/entry-overlay";
import { JournalList } from "@/components/journal/journal-list";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { dhakaToday } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseFilter, toQuery } from "@mbl/domain/journal-filter";

// UIDD §4.10 (task 3.8, D-032): every entry with filters, which live in the URL (a page's "See in
// Journal" links to `?who=<id>`); `?entry=<id>` opens its detail over the list (from a row, a
// "Reversed by" link or the duplicate dialog's View it), and closing keeps the filters. N-4.2: one
// `/views/journal` read.
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const entry = typeof params.entry === "string" ? params.entry : undefined;
  if (entry) preloadEntry(entry);
  const { rows, names, people, firstMonth } = await api<JournalView>("/views/journal");
  const filter = parseFilter(params, Object.keys(TYPE_LABEL));
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Journal</h1>
      {entry && <EntryOverlay id={entry} closeHref={withQuery("/journal", toQuery(filter))} />}
      <JournalList
        rows={rows}
        names={names}
        people={people}
        initial={filter}
        today={dhakaToday()}
        firstMonth={firstMonth}
      />
    </>
  );
}
