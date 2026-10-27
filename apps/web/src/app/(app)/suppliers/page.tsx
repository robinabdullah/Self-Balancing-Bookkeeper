import type { SuppliersView } from "@mbl/api/views/lists.controller";
import { api } from "@/api/client";
import { AccountList } from "@/components/accounts/account-list";
import { AccountTabs } from "@/components/shell/account-tabs";

// UIDD §4.8 (task 4.3.2): every supplier with what we owe them (from the books) and their last
// entry. N-4.4: one `/views/suppliers` read.
export default async function SuppliersPage() {
  const { rows } = await api<SuppliersView>("/views/suppliers");
  return (
    <>
      <h1 className="sr-only">Suppliers</h1>
      <AccountTabs current="/suppliers" />
      <AccountList kind="supplier" rows={rows} searchLabel="Search name or phone" />
    </>
  );
}
