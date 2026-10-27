import type { BoughtLine, SentBackLine } from "@mbl/domain/by-model";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { type Allocation, computeClose, monthProfit } from "@mbl/domain/engine/months";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import type { StockLine, StockMoveKind } from "@mbl/domain/stock-movement";
import { PARTNERS } from "./invariant";

// CR-025 (D-045): one synthetic business for the report tests, covering the edge cases of the
// cross-report check: the opening month (imported stock and a card balance), an EMI purchase on
// an investor's card, card payments and a cashback to the card, a supplier's cash purchase and
// credit purchase, a return refunded in cash, a damaged / lost write-off, a customer return, a
// capital_in reversed, an opening correction (a missed lot) in a later month, a purchase off a
// customer's due and its return to them, a closed month (Sep) and an open one (Oct). Synthetic ids
// and amounts only (D-014). The stock lines and by-model lines are written beside each entry, as
// the loaders read them from the lot lines.

export const [ARIF, SUMON] = PARTNERS.map((p) => p.id);
export const NADIM = "person-nadim"; // an investor
export const CUST = "cust-1";
export const SUPP = "supp-1";
export const CARD = "card-1"; // Nadim's
export const IDLE_CARD = "card-2"; // Nadim's, never used
export const [MA, MB, MC] = ["model-a", "model-b", "model-c"];
export const TODAY = "2026-11-10";

const tk = (n: number) => n * 100;
let seq = 0;
export const entries: StoredEntry[] = [];
export const stock: StockLine[] = [];
/** Purchase / sent-back lines by who we bought from (supplier or customer id). */
export const bought: Record<string, (BoughtLine & { date: string })[]> = {};
export const sentBack: Record<string, (SentBackLine & { date: string })[]> = {};

function save(e: Entry, time = "10:00:00"): StoredEntry {
  seq += 1;
  const s = {
    ...e,
    id: `e-${seq}`,
    createdAt: `${e.date}T${time}.${String(seq).padStart(3, "0")}Z`,
  };
  entries.push(s);
  return s;
}
const line = (date: string, modelId: string, qty: number, unitCost: number, kind: StockMoveKind) =>
  stock.push({ modelId, date, qty, unitCost, kind, reversal: false });

const money = (m: Omit<MoneyEntry, "table">) => save({ table: "money", ...m });

type Lot = { model: string; qty: number; unitCost: number; seller?: string };
function purchase(
  date: string,
  source:
    "cash" | "card" | "supplier_credit" | "customer_offset" | "opening" | "opening_correction",
  lot: Lot,
  more: Partial<Extract<Entry, { table: "purchase" }>> = {},
) {
  const kind =
    source === "opening" ? "opening" : source === "opening_correction" ? "correction" : "bought";
  line(date, lot.model, lot.qty, lot.unitCost, kind);
  if (lot.seller)
    (bought[lot.seller] ??= []).push({
      date,
      modelId: lot.model,
      qty: lot.qty,
      unitCost: lot.unitCost,
      reversal: false,
    });
  return save({
    table: "purchase",
    date,
    source,
    lines: [{ qty: lot.qty, unitCost: lot.unitCost }],
    ...more,
  });
}
function sale(date: string, model: string, qty: number, unitPrice: number, unitCost: number) {
  line(date, model, qty, unitCost, "sold");
  return save({ table: "sale", date, customerId: CUST, lines: [{ qty, unitPrice, unitCost }] });
}

// ---- September 2026: the opening month ----
// Net assets 5,00,000 cash + 10,000 stock − 5,000 card = 5,05,000; capital 5,00,000 → D 5,000.
money({ type: "opening", date: "2026-09-01", openingKind: "cash", amount: tk(500_000) });
purchase("2026-09-01", "opening", { model: MA, qty: 10, unitCost: tk(1_000) });
money({
  type: "opening",
  date: "2026-09-01",
  openingKind: "card_balance",
  cardId: CARD,
  amount: tk(5_000),
});
for (const [personId, amount] of [
  [ARIF, 200_000],
  [SUMON, 200_000],
  [NADIM, 100_000],
] as const)
  money({
    type: "opening",
    date: "2026-09-01",
    openingKind: "capital",
    personId,
    amount: tk(amount),
  });
for (const personId of [ARIF, SUMON])
  money({
    type: "opening",
    date: "2026-09-01",
    openingKind: "opening_difference",
    personId,
    amount: tk(2_500),
  });

money({ type: "capital_in", date: "2026-09-05", personId: NADIM, amount: tk(50_000) });
export const septSale = sale("2026-09-10", MA, 2, tk(1_500), tk(1_000));
money({ type: "customer_payment", date: "2026-09-10", customerId: CUST, amount: tk(1_000) });
// An EMI purchase on Nadim's card, from the supplier: 3 × ৳2,000 over 3 bills.
purchase(
  "2026-09-12",
  "card",
  { model: MB, qty: 3, unitCost: tk(2_000), seller: SUPP },
  {
    cardId: CARD,
    supplierId: SUPP,
    emiMonths: 3,
  },
);
// A cash purchase that names the supplier, then one on their credit.
purchase(
  "2026-09-14",
  "cash",
  { model: MA, qty: 2, unitCost: tk(1_000), seller: SUPP },
  { supplierId: SUPP },
);
purchase(
  "2026-09-15",
  "supplier_credit",
  { model: MB, qty: 1, unitCost: tk(2_000), seller: SUPP },
  {
    supplierId: SUPP,
  },
);
// One of their phones sent back, refunded in cash (no supplier on the return): ৳900 for ৳1,000.
line("2026-09-20", MA, 1, tk(1_000), "back");
(sentBack[SUPP] ??= []).push({
  date: "2026-09-20",
  modelId: MA,
  qty: 1,
  unitAmount: tk(900),
  reversal: false,
});
save({
  table: "return",
  kind: "purchase",
  date: "2026-09-20",
  refundTo: "cash",
  reason: "returned",
  lines: [{ qty: 1, unitAmount: tk(900), unitCost: tk(1_000) }],
});
// A damaged phone written off: never "sent back".
line("2026-09-21", MA, 1, tk(1_000), "written_off");
save({
  table: "return",
  kind: "purchase",
  date: "2026-09-21",
  reason: "damaged_lost",
  lines: [{ qty: 1, unitAmount: 0, unitCost: tk(1_000) }],
});
export const septPayment = money({
  type: "card_payment",
  date: "2026-09-25",
  cardId: CARD,
  amount: tk(3_000),
});
money({ type: "cashback", date: "2026-09-26", source: "card", cardId: CARD, amount: tk(100) });

// ---- October 2026 (open) ----
money({ type: "profit_paid", date: "2026-10-05", personId: NADIM, amount: tk(2_000) });
money({ type: "profit_reinvested", date: "2026-10-06", personId: NADIM, amount: tk(1_000) });
money({ type: "capital_out", date: "2026-10-07", personId: SUMON, amount: tk(10_000) });
const arifIn = money({
  type: "capital_in",
  date: "2026-10-08",
  personId: ARIF,
  amount: tk(5_000),
});
money({
  type: "capital_in",
  date: "2026-10-09",
  personId: ARIF,
  amount: tk(5_000),
  reversesId: arifIn.id,
});
sale("2026-10-10", MB, 1, tk(2_500), tk(2_000));
line("2026-10-12", MA, 1, tk(1_000), "returned_in");
save({
  table: "return",
  kind: "customer",
  date: "2026-10-12",
  customerId: CUST,
  lines: [{ qty: 1, unitAmount: tk(1_500), unitCost: tk(1_000) }],
});
// A lot missed at the opening, found in October: its own Corrections column.
purchase("2026-10-15", "opening_correction", { model: MC, qty: 1, unitCost: tk(500) });
// A phone bought off the customer's due, then sent back to them (refund to their due).
purchase(
  "2026-10-16",
  "customer_offset",
  { model: MC, qty: 1, unitCost: tk(400), seller: CUST },
  {
    customerId: CUST,
  },
);
line("2026-10-17", MC, 1, tk(400), "back");
(sentBack[CUST] ??= []).push({
  date: "2026-10-17",
  modelId: MC,
  qty: 1,
  unitAmount: tk(400),
  reversal: false,
});
save({
  table: "return",
  kind: "purchase",
  date: "2026-10-17",
  refundTo: "customer",
  customerId: CUST,
  reason: "returned",
  lines: [{ qty: 1, unitAmount: tk(400), unitCost: tk(400) }],
});
money({ type: "card_payment", date: "2026-10-20", cardId: CARD, amount: tk(2_000) });

// ---- November 2026 (today 10 Nov) ----
money({ type: "card_payment", date: "2026-11-05", cardId: CARD, amount: tk(1_000) });

// ---- September closed: Nadim's cash and card allocations, the partners' split ----
const base: Omit<BooksData, "allocations" | "closed"> = {
  entries,
  partners: PARTNERS,
  cards: [
    { id: CARD, statementDay: 5, dueDay: 20 },
    { id: IDLE_CARD, statementDay: 10, dueDay: 25 },
  ],
  billDates: [],
};
const sepProfit = monthProfit(
  computeBooks({ ...base, allocations: [], closed: [] }, TODAY).posted,
  "2026-09",
  TODAY,
);
const investors: Allocation[] = [
  {
    month: "2026-09-01",
    personId: NADIM,
    kind: "cash",
    basis: tk(150_000),
    ratePct: 2,
    amount: tk(3_000),
  },
  // The card basis is typed at the close; a typed cash basis that differs is noted.
  {
    month: "2026-09-01",
    personId: NADIM,
    kind: "card",
    basis: tk(6_000),
    ratePct: 1.5,
    amount: tk(90),
  },
];
export const allocations: Allocation[] = [
  ...investors,
  ...computeClose(sepProfit, investors, PARTNERS).map((a) => ({ ...a, month: "2026-09-01" })),
];
export const data: BooksData = { ...base, allocations, closed: ["2026-09-01"] };
export const books = computeBooks(data, TODAY);
export const snapshots = { "2026-09": sepProfit };

const types = new Map(
  entries.map((e) => [
    e.id,
    e.table === "money"
      ? e.type
      : e.table === "return"
        ? `${e.kind === "customer" ? "customer" : "purchase"}_return`
        : e.table,
  ]),
);
export const typeOf = (id: string) => types.get(id);

export const person = (id: string) =>
  ({
    [ARIF]: { id: ARIF, name: "Arif", kind: "partner" as const, profitSharePct: "50.000" },
    [SUMON]: { id: SUMON, name: "Sumon", kind: "partner" as const, profitSharePct: "50.000" },
    [NADIM]: { id: NADIM, name: "Nadim", kind: "investor" as const, profitSharePct: null },
  })[id]!;

export const setupCards = [CARD, IDLE_CARD].map((id) => ({
  id,
  name: id === CARD ? "EBL" : "City",
  network: "visa" as const,
  owner: "Nadim",
  ownerPersonId: NADIM,
  display: id === CARD ? "Nadim · EBL Visa" : "Nadim · City Visa",
  statementDay: id === CARD ? 5 : 10,
  dueDay: id === CARD ? 20 : 25,
  creditLimit: null,
  active: true,
}));

/** The lines dated inside a period. */
export const within = <T extends { date: string }>(lines: T[], from: string, to: string) =>
  lines.filter((l) => l.date >= from && l.date <= to);
