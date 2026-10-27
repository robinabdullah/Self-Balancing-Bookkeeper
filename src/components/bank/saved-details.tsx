"use client";

import { useState } from "react";
import { inputClass } from "@/components/forms/field";
import type { BankAccount } from "@/server/business";
import { BankAccounts, type OwnerOptions } from "./bank-accounts";

// UIDD §4.14 (D-039): the saved bank accounts grouped by owner, with a search over the owner,
// bank, account name and number.
export function SavedDetails({
  accounts,
  owners,
}: {
  accounts: BankAccount[];
  owners: OwnerOptions;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = accounts.filter(
    (a) =>
      !q ||
      [a.owner.label, a.bankName, a.accountName, a.accountNumber]
        .join(" ")
        .toLowerCase()
        .includes(q),
  );
  // Already in owner order (the business first): one group per owner.
  const groups: { label: string; accounts: BankAccount[] }[] = [];
  for (const a of shown) {
    const last = groups[groups.length - 1];
    if (last?.label === a.owner.label) last.accounts.push(a);
    else groups.push({ label: a.owner.label, accounts: [a] });
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      {accounts.length > 0 && (
        <input
          type="search"
          aria-label="Search saved details"
          placeholder="Search owner, bank or account"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      )}
      <BankAccounts
        accounts={shown}
        owners={owners}
        empty={q ? "Nothing matches." : "No saved bank accounts yet."}
      >
        {(card) =>
          groups.map((g) => (
            <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-sm font-medium">{g.label}</h2>
              <ul className="flex flex-col gap-2">{g.accounts.map(card)}</ul>
            </section>
          ))
        }
      </BankAccounts>
    </div>
  );
}
