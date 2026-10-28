import type { BankAccountsView } from "@mbl/api/views/overlays.controller";
import { api } from "@/api/client";
import type { Owner } from "@/api/contract";
import { withQuery } from "@mbl/domain/href";
import { BankAccountsSheet } from "./bank-sheet";

// D-039: an owner's saved bank accounts over their page (`?bank=1`), like `EntryOverlay`. N-4.5:
// one `/views/bank-accounts` read.
export async function BankOverlay({ owner, closeHref }: { owner: Owner; closeHref: string }) {
  const accounts = await api<BankAccountsView>(
    withQuery("/views/bank-accounts", { kind: owner.kind, id: owner.id }),
  );
  return <BankAccountsSheet owner={owner} accounts={accounts} closeHref={closeHref} />;
}
