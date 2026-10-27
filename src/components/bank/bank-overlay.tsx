import { type Owner, loadBankAccounts } from "@/server/business";
import { BankAccountsSheet } from "./bank-sheet";

// D-039: an owner's saved bank accounts over their page (`?bank=1`), like `EntryOverlay`.
export async function BankOverlay({ owner, closeHref }: { owner: Owner; closeHref: string }) {
  const accounts = (await loadBankAccounts()).filter(
    (a) => a.owner.kind === owner.kind && a.owner.id === owner.id,
  );
  return <BankAccountsSheet owner={owner} accounts={accounts} closeHref={closeHref} />;
}
