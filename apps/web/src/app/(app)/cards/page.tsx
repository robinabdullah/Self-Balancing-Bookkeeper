import { CardList } from "@/components/cards/card-list";
import { AccountTabs } from "@/components/shell/account-tabs";
import { cardRows } from "@/lib/card-view";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.4.1): every card with its balance, Available ≈, next due and status (SRS §6).
export default async function CardsPage() {
  const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const rows = cardRows(setup.cards, books.cards);
  return (
    <>
      <h1 className="sr-only">Cards</h1>
      <AccountTabs current="/cards" />
      <CardList rows={rows} />
    </>
  );
}
