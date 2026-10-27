"use client";

import { useState } from "react";
import Link from "next/link";
import { inputClass } from "@/components/forms/field";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { type AccountRow, searchRows, supplierDueText } from "@mbl/domain/accounts";
import { formatDate } from "@mbl/domain/dates";
import { dueText } from "@mbl/domain/setup";

// UIDD §4.8 (task 4.3): the Customers / Suppliers list: name, due, last activity; a row opens the
// detail. Search by name or phone (customers: shop name, proprietor name or phone).

type Props = {
  kind: "customer" | "supplier";
  rows: AccountRow[];
  searchLabel: string;
};

export function AccountList({ kind, rows, searchLabel }: Props) {
  const [search, setSearch] = useState("");
  const shown = searchRows(rows, search);
  const due = kind === "customer" ? dueText : supplierDueText;
  const base = kind === "customer" ? "/customers" : "/suppliers";

  if (rows.length === 0)
    return (
      <EmptyState hint={`No ${kind}s yet. Add one in Setup.`}>
        <Button asChild className="min-h-11">
          <Link href="/setup">Setup</Link>
        </Button>
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {searchLabel}
        <input
          type="search"
          className={inputClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {shown.length === 0 ? (
        <EmptyState hint="No one matches this search." />
      ) : (
        <ul
          aria-label={kind === "customer" ? "Customers" : "Suppliers"}
          className="divide-y rounded-lg border"
        >
          {shown.map((r) => (
            <li key={r.id} className="px-3">
              <Link
                href={`${base}/${r.id}`}
                className="grid min-h-11 grid-cols-[1fr_auto] gap-x-3 py-2"
              >
                <span className="font-medium">
                  {r.name}
                  {r.badge && (
                    <span className="bg-muted ml-2 rounded-full border px-2 py-0.5 text-xs font-normal">
                      {r.badge}
                    </span>
                  )}
                </span>
                <span className="text-right font-medium tabular-nums">{due(r.balance)}</span>
                <span className="text-muted-foreground col-span-2 text-sm">
                  {r.lastActivity ? `Last entry ${formatDate(r.lastActivity)}` : "No entries yet"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
