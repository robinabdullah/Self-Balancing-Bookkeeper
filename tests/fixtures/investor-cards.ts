// The investor card fixture (SRS §6, D-069): fictional cards and rows in an investor's card-sheet
// shape (date, card, type, amount, cash-out?), mapped to entries and posted. The expected values
// in tests/engine/cards.test.ts and SRS §6 were checked by hand.
import type { Card } from "@/lib/engine/cards";
import { type Entry, type Posted, postEntry } from "@/lib/engine/post";
import { parse } from "@/lib/money";

export const INVESTOR = "person-nadim";

/** The cards' usual days (statement/due) from the SRS §6 table; the id is the card's name. */
export const INVESTOR_CARDS: Card[] = [
  ["Kite Visa", 19, 4],
  ["Lotus Visa", 20, 3],
  ["Delta Visa", 5, 20],
  ["Harbor Visa", 23, 14],
  ["Summit Visa", 10, 25],
  ["River Amex", 28, 12], // D-022: shares River Visa's days
  ["River Visa", 28, 12],
].map(([id, statementDay, dueDay]) => ({
  id: id as string,
  statementDay: statementDay as number,
  dueDay: dueDay as number,
}));

type Type = "Card purchase" | "Card payment" | "Cash invested";

/** Date, account (a card, or the investor), type, amount (BDT), cash-out? — in sheet order. */
const ROWS: [string, string, Type, string, boolean][] = [
  ["2026-09-01", INVESTOR, "Cash invested", "500000", false],
  ["2026-09-02", "Kite Visa", "Card purchase", "40000", false],
  ["2026-09-10", "River Amex", "Card purchase", "30000", false],
  ["2026-09-12", "Delta Visa", "Card purchase", "45250.75", false],
  ["2026-09-15", "Kite Visa", "Card purchase", "25000", true],
  ["2026-09-15", "River Visa", "Card purchase", "50000", false],
  ["2026-09-20", INVESTOR, "Cash invested", "300000", false],
  ["2026-09-20", "Summit Visa", "Card purchase", "25000", true],
  ["2026-09-25", "Kite Visa", "Card purchase", "30500.50", false],
  ["2026-09-25", "Harbor Visa", "Card purchase", "120000", false],
  ["2026-09-27", "River Visa", "Card purchase", "40000", true],
  ["2026-09-28", "Lotus Visa", "Card purchase", "150000", false],
  ["2026-09-30", "River Amex", "Card payment", "30000", false],
  ["2026-10-01", "Kite Visa", "Card payment", "80000", false],
  ["2026-10-02", "Harbor Visa", "Card purchase", "60000", true],
  ["2026-10-03", "Kite Visa", "Card purchase", "20000", true],
  ["2026-10-04", "Lotus Visa", "Card purchase", "100000", false],
  ["2026-10-05", "Delta Visa", "Card purchase", "20000", true],
];

/** Maps one row as in SRS §6 (Regression fixture → Mapping). */
function toEntry(account: string, type: Type, date: string, amount: number, cashOut: boolean): Entry {
  const card = { cardId: account };
  if (type === "Card purchase" && cashOut) {
    return {
      table: "money",
      type: "card_cash_out",
      date,
      amount,
      cardCharged: amount,
      cashReceived: amount,
      ...card,
    } satisfies Entry;
  }
  if (type === "Card purchase") {
    return {
      table: "purchase",
      source: "card",
      date,
      lines: [{ qty: 1, unitCost: amount }],
      ...card,
    } satisfies Entry;
  }
  if (type === "Card payment") {
    return { table: "money", type: "card_payment", date, amount, ...card } satisfies Entry;
  }
  return { table: "money", type: "capital_in", date, amount, personId: account } satisfies Entry;
}

/** `kind` = the money type, or the table for a purchase. */
export type InvestorRow = Posted & { kind: string };

/** Every row, posted in sheet order (created_at follows the row number). */
export function investorRows(): InvestorRow[] {
  return ROWS.map(([date, account, type, amount, cashOut], i) => {
    const entry = toEntry(account, type, date, parse(amount)!, cashOut);
    return {
      id: `investor-${i + 1}`,
      date,
      createdAt: `${date}T00:00:00.${String(i + 1).padStart(3, "0")}Z`,
      effects: postEntry(entry),
      billMonthOverride: null,
      kind: entry.table === "money" ? entry.type : entry.table,
    };
  });
}
