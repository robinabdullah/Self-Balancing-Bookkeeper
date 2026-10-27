"use client";

import { Button } from "@/components/ui/button";
import type { BankAccountFields } from "@/lib/business";

// D-040, D-041: "Add How to pay" (off by default) and, when on, the business's accounts as chips.
// The send preview and the Report sheet's Share PDF both use it.

export type PayAccount = { id: string; label: string; fields: BankAccountFields };

export function HowToPay({
  accounts,
  on,
  picked,
  onChange,
}: {
  accounts: PayAccount[];
  on: boolean;
  picked: string[];
  onChange: (on: boolean, picked: string[]) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <>
      <label className="flex min-h-11 items-center gap-2 font-medium">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          onChange={(e) => onChange(e.target.checked, picked)}
          className="accent-primary size-4"
        />
        Add How to pay
      </label>
      {on && (
        <div role="group" aria-label="Accounts to include" className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const isOn = picked.includes(a.id);
            return (
              <Button
                key={a.id}
                type="button"
                variant={isOn ? "default" : "outline"}
                aria-pressed={isOn}
                className="min-h-11 px-3"
                onClick={() =>
                  onChange(true, isOn ? picked.filter((id) => id !== a.id) : [...picked, a.id])
                }
              >
                {a.label}
              </Button>
            );
          })}
        </div>
      )}
    </>
  );
}

/** The only account is picked for you. */
export const firstPick = (accounts: PayAccount[]) =>
  accounts.length === 1 ? [accounts[0].id] : [];
