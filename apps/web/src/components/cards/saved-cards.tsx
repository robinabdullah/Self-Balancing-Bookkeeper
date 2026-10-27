"use client";

import { useState } from "react";
import { inputClass } from "@/components/forms/field";
import type { Option } from "@/components/forms/picker";
import type { CardSecret } from "@/server/card-secrets";
import { CardSecrets } from "./card-secrets";

// D-046 (UIDD §4.14): Saved details → Cards: the cards that have saved details, with a search over
// the card, its owner and the last 4 digits.
export function SavedCards({
  items,
  addable,
  hasPasskey,
}: {
  items: CardSecret[];
  addable: Option[];
  hasPasskey: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = items.filter((s) => !q || `${s.display} ${s.last4}`.toLowerCase().includes(q));
  return (
    <div className="flex max-w-xl flex-col gap-3">
      {items.length > 0 && (
        <input
          type="search"
          aria-label="Search saved cards"
          placeholder="Search card, owner or last 4 digits"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
      )}
      <CardSecrets
        items={shown}
        addable={addable}
        hasPasskey={hasPasskey}
        withPrimary={items.filter((s) => !s.supplementary).map((s) => s.cardId)}
        empty={q ? "Nothing matches." : "No saved card details yet."}
      />
    </div>
  );
}
