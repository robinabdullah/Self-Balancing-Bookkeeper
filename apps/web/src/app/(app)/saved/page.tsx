import Link from "next/link";
import { SavedDetails } from "@/components/bank/saved-details";
import { SavedCards } from "@/components/cards/saved-cards";
import { cn } from "@/lib/utils";
import type { SavedView } from "@mbl/api/views/admin.controller";
import { api } from "@/api/client";

// UIDD §4.14: More → Saved details, in two tabs (D-046). Bank accounts (D-039): every saved bank
// account, grouped by owner (the business first), with a search; Add picks the owner (pick, don't
// type): active rows only, plus the owners that already have accounts. Cards: the cards with
// saved details, masked; Add picks one of the active cards without them. N-4.6: one
// `/views/saved?tab=` read.
const tabs = [
  ["bank", "Bank accounts"],
  ["cards", "Cards"],
] as const;

export default async function SavedDetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const tab = (await searchParams).tab === "cards" ? "cards" : "bank";
  const view = await api<SavedView>(`/views/saved?tab=${tab}`);
  return (
    <>
      <h1 className="mb-3 text-xl font-semibold">Saved details</h1>
      <nav aria-label="Saved details" className="bg-muted mb-4 flex max-w-xl gap-1 rounded-lg p-1">
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={k === "bank" ? "/saved" : `/saved?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className={cn(
              "text-foreground/75 flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm",
              k === tab && "bg-background text-foreground font-medium shadow-sm",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {view.tab === "cards" ? (
        <SavedCards items={view.items} addable={view.addable} hasPasskey={view.hasPasskey} />
      ) : (
        <SavedDetails accounts={view.accounts} owners={view.owners} />
      )}
    </>
  );
}
