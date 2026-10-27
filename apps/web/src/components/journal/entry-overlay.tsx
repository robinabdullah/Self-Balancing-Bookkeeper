import { cache } from "react";
import type { EntryView } from "@mbl/api/views/home.controller";
import { api } from "@/api/client";
import { EntryDetail } from "./entry-detail";

// D-032: an entry's detail sheet over any page that lists entries (`<page>?entry=<id>`): Home,
// Journal, card, customer, supplier and person. Closing returns to `closeHref` (the same page).
// D-061: the entry as the books hold it (and its original, for a reversal) feeds "What it did".
// N-4.2: one `/views/entry/:id` read, once per render (`cache`).
const entryView = cache((id: string) => api<EntryView>(`/views/entry/${encodeURIComponent(id)}`));

/**
 * Starts loading an entry so it runs alongside the page's own data. The `catch` only marks this
 * early start as handled (a page that stops early, e.g. not found, never reads it); whoever reads
 * the entry still gets any error.
 */
export const preloadEntry = (id: string) => void entryView(id).catch(() => {});

export async function EntryOverlay({ id, closeHref }: { id: string; closeHref: string }) {
  const view = await entryView(id);
  if (!view)
    return (
      <p role="status" className="bg-muted mb-3 rounded-lg p-3 text-sm">
        That entry no longer exists.
      </p>
    );
  const { entry, names, posting, cards, billDates } = view;
  return (
    <EntryDetail
      key={entry.row.id}
      entry={entry}
      names={names}
      closeHref={closeHref}
      posting={posting}
      cards={cards}
      billDates={billDates}
    />
  );
}
