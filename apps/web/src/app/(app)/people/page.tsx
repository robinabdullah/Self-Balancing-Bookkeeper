import { PeopleList } from "@/components/people/people-list";
import { AccountTabs } from "@/components/shell/account-tabs";
import { peopleRows } from "@mbl/domain/people-view";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.5): every partner and investor with their capital and profit owed.
export default async function PeoplePage() {
  const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  return (
    <>
      <h1 className="sr-only">People</h1>
      <AccountTabs current="/people" />
      <PeopleList rows={peopleRows(setup.people, books)} />
    </>
  );
}
