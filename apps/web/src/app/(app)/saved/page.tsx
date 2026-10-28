import type { BankAccount } from "@/api/contract";
import Link from "next/link";
import { SavedDetails } from "@/components/bank/saved-details";
import { SavedCards } from "@/components/cards/saved-cards";
import { getUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { loadBankAccounts } from "@/server/business";
import { loadCardSecrets } from "@/server/card-secrets";
import { loadPasskeys } from "@/server/passkeys";
import { loadSetup } from "@/server/setup";

// UIDD §4.14: More → Saved details, in two tabs (D-046). Bank accounts (D-039): every saved bank
// account, grouped by owner (the business first), with a search; Add picks the owner (pick, don't
// type): active rows only, plus the owners that already have accounts. Cards: the cards with
// saved details, masked; Add picks one of the active cards without them.
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
      {tab === "cards" ? <CardsTab /> : <BankTab />}
    </>
  );
}

async function BankTab() {
  const [accounts, setup] = await Promise.all([loadBankAccounts(), loadSetup()]);
  const has = new Set(accounts.map((a) => a.owner.id));
  const pickable = (r: { id: string; active: boolean }) => r.active || has.has(r.id);
  const owners = {
    person: setup.people.filter(pickable).map((p) => ({ id: p.id, label: p.name })),
    customer: setup.customers
      .filter((c) => !c.isSystem && pickable(c))
      .map((c) => ({ id: c.id, label: c.display })),
    supplier: setup.suppliers.filter(pickable).map((s) => ({ id: s.id, label: s.name })),
  };
  // Until N-4.6 reads `/views/saved`: the RSC sends the rows' `createdAt` as a Date, which Saved
  // details never reads; its props now take the api's JSON shape (contract.ts).
  return <SavedDetails accounts={accounts as unknown as BankAccount[]} owners={owners} />;
}

async function CardsTab() {
  const user = await getUser();
  const [items, setup, keys] = await Promise.all([
    loadCardSecrets(),
    loadSetup(),
    user ? loadPasskeys(user.id) : [],
  ]);
  // D-054: any active card, also one that has numbers (a supplementary card on its bill).
  const addable = setup.cards
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, label: c.display }));
  return <SavedCards items={items} addable={addable} hasPasskey={keys.length > 0} />;
}
