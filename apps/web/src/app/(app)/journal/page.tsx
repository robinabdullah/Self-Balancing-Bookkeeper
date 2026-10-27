import { EntryOverlay } from "@/components/journal/entry-overlay";
import { JournalList } from "@/components/journal/journal-list";
import { TYPE_LABEL } from "@mbl/domain/journal/labels";
import { dhakaToday, monthOf } from "@mbl/domain/dates";
import { withQuery } from "@mbl/domain/href";
import { parseFilter, toQuery } from "@mbl/domain/journal-filter";
import { setupNames } from "@mbl/domain/setup";
import { loadJournal, preloadEntry } from "@/server/journal";
import { loadSetup } from "@/server/setup";

// UIDD §4.10 (task 3.8, D-032): every entry with filters, which live in the URL (a page's "See in
// Journal" links to `?who=<id>`); `?entry=<id>` opens its detail over the list (from a row, a
// "Reversed by" link or the duplicate dialog's View it), and closing keeps the filters.
export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const entry = typeof params.entry === "string" ? params.entry : undefined;
  if (entry) preloadEntry(entry);
  const [rows, data] = await Promise.all([loadJournal(), loadSetup()]);
  const filter = parseFilter(params, Object.keys(TYPE_LABEL));
  const people = [
    ...data.customers.map((c) => ({ id: c.id, label: c.display, hint: "Customer" })),
    ...data.suppliers.map((s) => ({ id: s.id, label: s.name, hint: "Supplier" })),
    ...data.cards.map((c) => ({ id: c.id, label: c.display, hint: "Card" })),
    ...data.people.map((p) => ({ id: p.id, label: p.name, hint: "Person" })),
  ];
  const oldest = rows.at(-1)?.date;
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Journal</h1>
      {entry && <EntryOverlay id={entry} closeHref={withQuery("/journal", toQuery(filter))} />}
      <JournalList
        rows={rows}
        names={setupNames(data)}
        people={people}
        initial={filter}
        today={dhakaToday()}
        firstMonth={oldest ? monthOf(oldest) : null}
      />
    </>
  );
}
