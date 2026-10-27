import type { CardsView } from "@mbl/api/views/lists.controller";
import { api } from "@/api/client";
import { CardList } from "@/components/cards/card-list";
import { AccountTabs } from "@/components/shell/account-tabs";

// UIDD §4.8 (task 4.4.1): every card with its balance, Available ≈, next due and status (SRS §6).
// N-4.4: one `/views/cards` read.
export default async function CardsPage() {
  const { rows } = await api<CardsView>("/views/cards");
  return (
    <>
      <h1 className="sr-only">Cards</h1>
      <AccountTabs current="/cards" />
      <CardList rows={rows} />
    </>
  );
}
