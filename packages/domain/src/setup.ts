import { type CardNetwork, NETWORK_LABEL, typeWordIn } from "./banks";
import { format } from "./money";

// Setup display rules and messages (PRD §4.1; SRS §4 Setup; UIDD §4.11; D-022, D-023). Pure, so
// the Setup screen, pickers and actions share one source.

export const setupKinds = ["person", "card", "customer", "supplier", "model"] as const;
export type SetupKind = (typeof setupKinds)[number];

/** A row that other rows point to can't be deleted (UIDD §4.11). */
export const USED = "Already used — deactivate it instead";
/** D-023: Walk-in is read-only in Setup. */
export const BUILT_IN = "Walk-in is built in and can't be changed";

/** "Shop name (Proprietor)", or the proprietor while no shop name is set (SRS §4). */
export function customerName(c: { shopName: string | null; proprietorName: string }) {
  return c.shopName ? `${c.shopName} (${c.proprietorName})` : c.proprietorName;
}

/** UIDD §2 wording for a customer's current due: "Owes ৳5,000", "Credit ৳200", "No due". */
export function dueText(poisha: number) {
  if (poisha > 0) return `Owes ${format(poisha)}`;
  if (poisha < 0) return `Credit ${format(0 - poisha)}`;
  return "No due";
}

/** D-036: "Card Type" ("EBL Visa"); the Type isn't said twice. */
export function cardTitle(card: string, network: CardNetwork = "none") {
  const type = network === "none" || typeWordIn(card, network) ? "" : ` ${NETWORK_LABEL[network]}`;
  return `${card}${type}`;
}

/** D-022, D-036: "Owner · Card Type" ("Arif · EBL Visa"). */
export function cardName(card: string, owner: string, network: CardNetwork = "none") {
  return `${owner} · ${cardTitle(card, network)}`;
}

type Person = { kind: string; active: boolean; profitSharePct: string | null };

/**
 * D-023: a save is allowed while the active partners' %s don't total 100; Setup shows this
 * warning instead (close and import reject it). Summed in thousandths: numeric(6,3), no floats.
 */
export function partnerWarning(people: Person[]): string | null {
  const thousandths = people
    .filter((p) => p.kind === "partner" && p.active)
    .reduce((sum, p) => sum + Math.round(Number(p.profitSharePct ?? 0) * 1000), 0);
  if (thousandths === 100_000) return null;
  return `Partners total ${thousandths / 1000}% — must be 100 before closing`;
}

type Named = { id: string; name: string };
type Shown = { id: string; display: string };

/** id → display name for every Setup row (the preview's and the Journal's `Names`). */
export function setupNames(data: {
  people: Named[];
  suppliers: Named[];
  models: Named[];
  cards: Shown[];
  customers: Shown[];
}): Record<string, string> {
  return Object.fromEntries([
    ...[...data.people, ...data.suppliers, ...data.models].map((r) => [r.id, r.name]),
    ...[...data.cards, ...data.customers].map((r) => [r.id, r.display]),
  ]);
}
