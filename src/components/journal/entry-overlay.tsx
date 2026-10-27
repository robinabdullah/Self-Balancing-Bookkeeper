import { setupNames } from "@/lib/setup";
import { loadBooks } from "@/server/books";
import { loadEntry } from "@/server/journal";
import { loadSetup } from "@/server/setup";
import { EntryDetail } from "./entry-detail";

// D-032: an entry's detail sheet over any page that lists entries (`<page>?entry=<id>`): Home,
// Journal, card, customer, supplier and person. Closing returns to `closeHref` (the same page).
// D-061: the entry as the books hold it (and its original, for a reversal) feeds "What it did".
export async function EntryOverlay({ id, closeHref }: { id: string; closeHref: string }) {
  const [entry, setup, { data }] = await Promise.all([loadEntry(id), loadSetup(), loadBooks()]);
  if (!entry)
    return (
      <p role="status" className="bg-muted mb-3 rounded-lg p-3 text-sm">
        That entry no longer exists.
      </p>
    );
  const stored = data.entries.find((e) => e.id === id);
  const original = stored?.reversesId && data.entries.find((e) => e.id === stored.reversesId);
  return (
    <EntryDetail
      key={entry.row.id}
      entry={entry}
      names={setupNames(setup)}
      closeHref={closeHref}
      posting={
        stored
          ? {
              entry: stored,
              original: original || null,
              reversed: !!entry.row.reversedBy,
              partners: data.partners,
            }
          : null
      }
      cards={data.cards}
      billDates={data.billDates}
    />
  );
}
