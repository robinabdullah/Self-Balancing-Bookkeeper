// D-061 (UIDD §3, §4.10, §5): what an entry does, as label · amount rows. One builder for the
// forms' "What this will do", the confirm sheets and the Journal ("What it did", Delete, Reverse).
// The rows are an entry's own `postEntry` effects (SRS §5) and a card charge's bill the cards
// engine's `billMonthOf` (SRS §6.3), so nothing here can disagree with the books. Pure.
import { formatMonth, monthOf } from "./dates";
import { type BillDates, type Card, billMonthOf } from "./engine/cards";
import type { StoredEntry } from "./engine/index";
import { type Account, type Effect, type Entry, type Partner, postEntry } from "./engine/post";
import { add, format } from "./money";

/** id → display name: customers "Shop (Proprietor)", cards "Owner · Card" (D-022, D-024). */
export type Names = Record<string, string>;

/** One row: what changes, a muted sub-line (a bill, a month), and the signed amount. */
export type EffectRow = { label: string; sub?: string; value: string };

/** The names, and the cards with their actual bill dates (for a card charge's bill). */
export type RowsContext = { names: Names; cards?: Card[]; billDates?: BillDates[] };

/**
 * Where an entry's card charge is billed, and what the rows say about it (D-058): `cancels` = they
 * take a charge back off its bill; `reversed` = a charge a reversal has taken off; `restores` = a
 * charge going back on (deleting its reversal).
 */
export type BillOf = {
  date: string;
  billMonthOverride?: string | null;
  emiMonths?: number | null;
  mode?: "cancels" | "reversed" | "restores";
};

/** The sub-line per mode, and the sign of the card row it applies to (a charge > 0). */
const BILL_SUB: Record<
  NonNullable<BillOf["mode"]> | "charge",
  [1 | -1, (where: string) => string]
> = {
  charge: [1, (where) => where],
  cancels: [-1, (where) => `drops out of the ${where}`],
  reversed: [1, (where) => `was on the ${where} · reversed`],
  restores: [1, (where) => `back on the ${where}`],
};

const fallback: Partial<Record<Account, string>> = {
  customer_due: "Customer",
  supplier_due: "Supplier",
  card: "Card",
  capital: "Person",
  opening_diff: "Person",
  profit_owed: "Person",
};

function label(e: Effect, names: Names): string {
  const name = (e.id && names[e.id]) || fallback[e.account] || "";
  switch (e.account) {
    case "cash":
      return "Cash";
    case "stock":
      return "Stock";
    case "customer_due":
      return `${name} owes`;
    case "supplier_due":
      return `We owe ${name}`;
    case "card":
      return name;
    case "capital":
      return `${name}'s capital`;
    case "opening_diff":
      return `${name}'s opening difference`;
    case "profit_owed":
      return `Profit owed to ${name}`;
    case "profit":
      return "Profit";
  }
}

/** "+৳2,206.90", "-৳2,206.90": the app's own money format with a + on increases. */
export const signed = (poisha: number) => (poisha > 0 ? `+${format(poisha)}` : format(poisha));

/** A card's actual bill dates by bill month, as `billMonthOf` takes them. */
export function overridesOf(billDates: BillDates[], cardId: string): Map<string, BillDates> {
  return new Map(
    billDates.filter((o) => o.cardId === cardId).map((o) => [monthOf(o.billMonth), o]),
  );
}

/** One effect per account (and id, and profit month), in first-seen order; profit last. */
export function netEffects(effects: Effect[]): Effect[] {
  const out = new Map<string, Effect>();
  for (const e of effects) {
    const key = `${e.account}|${e.id ?? ""}|${e.month ?? ""}`;
    const seen = out.get(key);
    out.set(key, seen ? { ...seen, amount: add(seen.amount, e.amount) } : e);
  }
  const all = [...out.values()];
  return [
    ...all.filter((e) => e.account !== "profit"),
    ...all.filter((e) => e.account === "profit"),
  ];
}

/** A card row's sub-line: the bill a charge lands in, leaves, left or goes back on. */
function cardSub(e: Effect, ctx: RowsContext, bill: BillOf | undefined): string | undefined {
  const card = ctx.cards?.find((c) => c.id === e.id);
  if (!card || !bill) return undefined;
  const [sign, text] = BILL_SUB[bill.mode ?? "charge"];
  if (Math.sign(e.amount) !== sign) return undefined;
  const month = formatMonth(
    billMonthOf(card, bill.date, bill.billMonthOverride, overridesOf(ctx.billDates ?? [], card.id)),
  );
  const emi = bill.emiMonths != null && bill.emiMonths > 1 ? bill.emiMonths : null;
  return text(emi ? `${emi} bills from ${month}` : `${month} bill`);
}

/** The rows for these effects: one per account, then "no change" for an untouched Cash/Profit. */
export function effectRows(effects: Effect[], ctx: RowsContext, bill?: BillOf): EffectRow[] {
  const net = netEffects(effects);
  const moved = (a: Account) => net.some((e) => e.account === a && e.amount !== 0);
  const rows = net
    .filter((e) => e.amount !== 0 || (e.account !== "cash" && e.account !== "profit"))
    .map((e): EffectRow => {
      const sub =
        e.account === "card"
          ? cardSub(e, ctx, bill)
          : e.account === "profit" && e.month
            ? formatMonth(e.month)
            : undefined;
      const value = e.amount === 0 ? "no change" : signed(e.amount);
      return { label: label(e, ctx.names), ...(sub ? { sub } : {}), value };
    });
  const still = [!moved("cash") && "Cash", !moved("profit") && "Profit"].filter(Boolean);
  if (still.length === 0) return rows;
  const name = still.length === 2 ? "Cash and profit" : String(still[0]);
  return [...rows, { label: name, value: "no change" }];
}

/** Where an entry's card charge is billed. A reversal's is its original's, taken back. */
export function billOf(entry: Entry, original?: Entry | null): BillOf {
  const of = original ?? entry;
  const own = of.table === "purchase" || of.table === "money" ? of : null;
  return {
    date: of.date,
    billMonthOverride: own?.billMonthOverride ?? null,
    emiMonths: own?.emiMonths ?? null,
    ...(original || entry.reversesId ? { mode: "cancels" as const } : {}),
  };
}

/**
 * A saved entry (with its original, when it is a reversal; `reversed` when a reversal has taken it
 * back) and the partners it was split by.
 */
export type Posting = {
  entry: StoredEntry;
  original?: StoredEntry | null;
  reversed?: boolean;
  partners: Partner[];
};

/** UIDD §4.10 "What it did": the saved entry's rows. A reversed charge is no longer on its bill. */
export function didRows(p: Posting, ctx: RowsContext): EffectRow[] {
  const bill = billOf(p.entry, p.original);
  return effectRows(
    postEntry(p.entry, p.partners),
    ctx,
    p.reversed ? { ...bill, mode: "reversed" } : bill,
  );
}

/** The Delete dialog: what deleting takes back. Deleting a reversal puts its original back. */
export function deleteRows(p: Posting, ctx: RowsContext): EffectRow[] {
  const effects = postEntry(p.entry, p.partners).map((e) => ({ ...e, amount: 0 - e.amount }));
  return effectRows(effects, ctx, {
    ...billOf(p.entry, p.original),
    mode: p.original ? "restores" : "cancels",
  });
}

/**
 * The Reverse dialog: the reversal's rows on `date` (and `forMonth`, when the original has one),
 * as the reverse action stores it: the same facts, linked, in the reversal's own date / for_month.
 */
export function reversalRows(
  p: Posting,
  ctx: RowsContext,
  date: string,
  forMonth: string | null,
): EffectRow[] {
  const { entry } = p;
  const reversal: Entry =
    entry.table === "money"
      ? { ...entry, date, reversesId: entry.id, forMonth: entry.forMonth ? forMonth : null }
      : { ...entry, date, reversesId: entry.id };
  return effectRows(postEntry(reversal, p.partners), ctx, billOf(reversal, entry));
}
