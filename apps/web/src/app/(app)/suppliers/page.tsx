import { AccountList } from "@/components/accounts/account-list";
import { AccountTabs } from "@/components/shell/account-tabs";
import { accountRows } from "@/lib/accounts";
import { loadBooks } from "@/server/books";
import { loadSetup } from "@/server/setup";

// UIDD §4.8 (task 4.3.2): every supplier with what we owe them (from the books) and their last
// entry.
export default async function SuppliersPage() {
  const [{ books }, setup] = await Promise.all([loadBooks(), loadSetup()]);
  const rows = accountRows(
    setup.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      terms: [s.name, s.phone],
      badge: s.active ? undefined : "Inactive",
    })),
    books.suppliers,
  );
  return (
    <>
      <h1 className="sr-only">Suppliers</h1>
      <AccountTabs current="/suppliers" />
      <AccountList kind="supplier" rows={rows} searchLabel="Search name or phone" />
    </>
  );
}
