import type { CustomersView } from "@mbl/api/views/lists.controller";
import { api } from "@/api/client";
import { AccountList } from "@/components/accounts/account-list";
import { AccountTabs } from "@/components/shell/account-tabs";

// UIDD §4.8 (task 4.3.1): every customer with what they owe (from the books) and their last entry.
// N-4.4: one `/views/customers` read.
export default async function CustomersPage() {
  const { rows } = await api<CustomersView>("/views/customers");
  return (
    <>
      <h1 className="sr-only">Customers</h1>
      <AccountTabs current="/customers" />
      <AccountList kind="customer" rows={rows} searchLabel="Search shop, proprietor or phone" />
    </>
  );
}
