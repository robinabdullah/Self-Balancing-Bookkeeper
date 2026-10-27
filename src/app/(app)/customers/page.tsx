import { AccountList } from "@/components/accounts/account-list";
import { AccountTabs } from "@/components/shell/account-tabs";
import { accountRows } from "@/lib/accounts";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.3.1): every customer with what they owe (from the books) and their last entry.
export default async function CustomersPage() {
  const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const rows = accountRows(
    setup.customers.map((c) => ({
      id: c.id,
      name: c.display,
      terms: [c.shopName, c.proprietorName, c.phone],
      badge: c.active ? undefined : "Inactive",
    })),
    books.customers,
  );
  return (
    <>
      <h1 className="sr-only">Customers</h1>
      <AccountTabs current="/customers" />
      <AccountList kind="customer" rows={rows} searchLabel="Search shop, proprietor or phone" />
    </>
  );
}
