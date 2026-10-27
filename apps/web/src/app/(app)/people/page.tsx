import type { PeopleView } from "@mbl/api/views/lists.controller";
import { api } from "@/api/client";
import { PeopleList } from "@/components/people/people-list";
import { AccountTabs } from "@/components/shell/account-tabs";

// UIDD §4.8 (task 4.5): every partner and investor with their capital and profit owed. N-4.4: one
// `/views/people` read.
export default async function PeoplePage() {
  const { rows } = await api<PeopleView>("/views/people");
  return (
    <>
      <h1 className="sr-only">People</h1>
      <AccountTabs current="/people" />
      <PeopleList rows={rows} />
    </>
  );
}
