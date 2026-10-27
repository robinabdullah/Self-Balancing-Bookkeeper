import type { StoredEntry } from "@/lib/engine/index";
import type { MoneyEntry } from "@/lib/engine/post";

// D-064: what each entry is, for the charts that group the posted effects by kind (Given vs
// collected, Last paid, …). The keys are the Journal's types (`TYPE_LABEL`). A reversal is stored
// with its original's table and type, so it gets its original's kind and counts on its own date.
// Pure.

export type Kind = "sale" | "customer_return" | "purchase" | "purchase_return" | MoneyEntry["type"];

export function kindOf(entry: StoredEntry): Kind {
  switch (entry.table) {
    case "money":
      return entry.type;
    case "return":
      return entry.kind === "customer" ? "customer_return" : "purchase_return";
    default:
      return entry.table;
  }
}

/** Entry id → its kind. */
export function entryKinds(entries: StoredEntry[]): Map<string, Kind> {
  return new Map(entries.map((e) => [e.id, kindOf(e)]));
}

/** The entries of `kind` that still stand: not a reversal, and not reversed. */
export function standing(entries: StoredEntry[], kind: Kind): StoredEntry[] {
  const reversed = new Set(entries.map((e) => e.reversesId).filter(Boolean));
  return entries.filter((e) => kindOf(e) === kind && !e.reversesId && !reversed.has(e.id));
}
