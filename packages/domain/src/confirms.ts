// UIDD §5 (D-060, D-061): the sheets that confirm what Save will do, only where the money goes
// somewhere the form's name doesn't say. Each is a title, one sentence, the entry's own rows
// (`effectRows`, from `postEntry`) and small notes. Null: save at once. Pure.
import { feePct } from "@/lib/cash-out";
import type { BillDates, Card } from "@/lib/engine/cards";
import {
  type Effect,
  type Entry,
  type MoneyEntry,
  type Partner,
  postEntry,
} from "@/lib/engine/post";
import { type EffectRow, type RowsContext, billOf, effectRows } from "@/lib/effect-rows";
import { format, sub } from "@/lib/money";

/** A confirm sheet's content: a sentence, label · amount rows, small notes. */
export type ConfirmSheet = {
  title: string;
  lead: string;
  rows: EffectRow[];
  notes: string[];
};

export type ConfirmContext = Omit<RowsContext, "cards" | "billDates"> & {
  cards: (Card & { owner: string; ownerPersonId: string })[];
  people: { id: string; name: string; kind: string }[];
  billDates: BillDates[];
  /** Each person's profit owed before this entry: profit paid / reinvested confirms above it. */
  owed: Record<string, number>;
  partners: Partner[];
};

/** The confirm Save opens for this entry, or null (another type, or still incomplete). */
export function entryConfirm(entry: Entry | null, ctx: ConfirmContext): ConfirmSheet | null {
  if (entry?.table !== "money") return null;
  let effects: Effect[];
  try {
    effects = postEntry(entry, ctx.partners);
  } catch {
    return null; // a needed pick is missing
  }
  if (effects.length === 0) return null;
  const rows = effectRows(effects, ctx, billOf(entry));
  switch (entry.type) {
    case "capital_out":
      return entry.source === "card" ? capitalOut(entry, rows, ctx) : null;
    case "card_cash_out":
      return cashOut(entry, rows, ctx);
    case "opening_correction":
      return openingCorrection(entry, rows, ctx);
    case "profit_paid":
    case "profit_reinvested":
      return profitAboveOwed(entry, rows, ctx);
    default:
      return null;
  }
}

/** D-060: a person's personal spending the business pays with a card's bill. */
function capitalOut(entry: MoneyEntry, rows: EffectRow[], ctx: ConfirmContext) {
  const card = ctx.cards.find((c) => c.id === entry.cardId);
  const person = ctx.people.find((p) => p.id === entry.personId);
  if (!card || !person) return null;
  const cardName = ctx.names[card.id] ?? "The card";
  const who = person.name;
  return {
    title: `${who}'s personal spend`,
    lead: `The business pays this with ${cardName}'s bill. It comes off ${who}'s capital; it isn't a business cost.`,
    rows,
    notes: [
      ...(card.ownerPersonId === person.id
        ? []
        : [`Shows on ${card.owner}'s card statement as "Capital out · ${who}".`]),
      ...(person.kind === "investor"
        ? [`It lowers ${who}'s cash basis at the month's close.`]
        : []),
    ],
  };
}

/** Cash taken out through a card: the charge, the cash, and the fee between them. */
function cashOut(entry: MoneyEntry, rows: EffectRow[], ctx: ConfirmContext) {
  const charged = entry.cardCharged ?? entry.amount;
  const received = entry.cashReceived ?? 0;
  const fee = sub(charged, received);
  const pct = feePct(fee, charged);
  const card = (entry.cardId && ctx.names[entry.cardId]) || "the card";
  return {
    title: `Cash-out on ${card}`,
    lead:
      fee === 0
        ? `${format(charged)} goes on the card and comes in as cash, with no fee.`
        : `${format(charged)} goes on the card and ${format(received)} comes in as cash. The ${format(fee)} difference is a fee, a business expense.`,
    rows: rows.map((r) =>
      r.label === "Profit" && r.sub && pct ? { ...r, sub: `${r.sub} · fee ${pct}%` } : r,
    ),
    notes: [],
  };
}

/** What was wrong at opening, in a few words. */
function openingWhat(entry: MoneyEntry, ctx: ConfirmContext): string {
  const name = (id: string | null | undefined) => (id && ctx.names[id]) || "";
  switch (entry.openingKind) {
    case "customer_due":
      return `${name(entry.customerId)}'s due`;
    case "supplier_due":
      return `What we owed ${name(entry.supplierId)}`;
    case "card_balance":
      return `${name(entry.cardId)}'s balance`;
    case "capital":
      return `${name(entry.personId)}'s capital`;
    case "profit_owed":
      return `${name(entry.personId)}'s profit owed`;
    default:
      return "Cash";
  }
}

/** A fix to the opening: the item and the partners' opening difference, not this month's profit. */
function openingCorrection(entry: MoneyEntry, rows: EffectRow[], ctx: ConfirmContext) {
  return {
    title: "Correct the opening",
    lead: `${openingWhat(entry, ctx)} at opening was wrong. The fix goes to the partners' opening difference, not this month's profit.`,
    rows,
    notes: [],
  };
}

/** Profit paid / reinvested: confirmed only above what the person is owed (UIDD §4.6). */
function profitAboveOwed(entry: MoneyEntry, rows: EffectRow[], ctx: ConfirmContext) {
  const owed = (entry.personId && ctx.owed[entry.personId]) || 0;
  if (entry.amount <= owed) return null;
  const who = (entry.personId && ctx.names[entry.personId]) || "This person";
  const paid = entry.type === "profit_paid";
  return {
    title: paid ? `Pay ${who}'s profit` : `${who} reinvests profit`,
    lead: paid
      ? `Cash paid to ${who} out of the profit ${who} is owed.`
      : `${who}'s profit stays in the business as capital.`,
    rows,
    notes: [
      `This is ${format(sub(entry.amount, owed))} more than ${who}'s profit owed (${format(owed)}).`,
    ],
  };
}
