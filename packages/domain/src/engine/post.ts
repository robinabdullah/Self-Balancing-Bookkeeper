// SRS §5 posting rules: the one place that maps an entry to its effects on the books. The engine
// and the forms' "What this will do" preview (UIDD §3) both call `postEntry`; nothing else may
// hold a copy of these rules. Pure: plain objects in, plain objects out, integer poisha.
import type {
  MONEY_TYPE_VALUES,
  OPENING_KIND_VALUES,
  PURCHASE_SOURCE_VALUES,
  REFUND_TO_VALUES,
  RETURN_REASON_VALUES,
  SETTLE_MODE_VALUES,
} from "../enums";
import { monthOf } from "../dates";
import { add, mul, splitShares, sub } from "../money";

type Enum<T extends readonly string[]> = T[number];

export type Account =
  | "cash"
  | "stock"
  | "customer_due"
  | "supplier_due"
  | "card"
  | "capital"
  | "opening_diff"
  | "profit_owed"
  | "profit";

/** Each account's side of the books-balance invariant (SRS §5). All amounts are signed. */
export const SIDE: Record<Account, "asset" | "liability" | "equity"> = {
  cash: "asset",
  stock: "asset",
  customer_due: "asset",
  supplier_due: "liability",
  card: "liability",
  capital: "equity",
  opening_diff: "equity", // capital booked as opening difference, shown apart until resolved
  profit_owed: "equity",
  profit: "equity", // Profit(month): undistributed until the month is closed
};

/**
 * What a profit effect comes from, for the month's breakdown (PRD §4.4, UIDD §4.9). `fee` = card
 * fees and cash-out fees; `purchase_return` = refund − cost (negative for a write-off).
 */
export const PROFIT_COMPONENTS = [
  "sale",
  "customer_return",
  "discount",
  "profit_share",
  "cashback",
  "expense",
  "fee",
  "purchase_return",
] as const;
export type ProfitComponent = (typeof PROFIT_COMPONENTS)[number];

/**
 * One signed change to one balance: `id` = the customer/supplier/card/person. A profit effect also
 * has its `month`, its `component` and, for an expense, its `category`.
 */
export type Effect = {
  account: Account;
  amount: number;
  id?: string;
  month?: string;
  component?: ProfitComponent;
  category?: string;
};

/**
 * A stored entry run through `postEntry`: the input the engine's views share. The entry's own
 * `billMonthOverride` ("YYYY-MM" or the stored 1st) and `emiMonths` feed the card bills (SRS §6);
 * `reversesId` takes a reversed pair off them (D-058).
 */
export type Posted = {
  id: string;
  date: string;
  createdAt: string;
  effects: Effect[];
  reversesId?: string | null;
  billMonthOverride?: string | null;
  emiMonths?: number | null;
};

/** Active partners in display order; the first takes the `splitShares` residual. */
export type Partner = { id: string; pct: number };

type Id = string | null | undefined;
type Base = { date: string; reversesId?: Id };

export type PurchaseEntry = Base & {
  table: "purchase";
  source: Enum<typeof PURCHASE_SOURCE_VALUES>;
  cardId?: Id;
  supplierId?: Id;
  customerId?: Id;
  emiMonths?: number | null;
  billMonthOverride?: string | null;
  lines: { qty: number; unitCost: number }[];
};

export type SaleEntry = Base & {
  table: "sale";
  customerId: string;
  lines: { qty: number; unitPrice: number; unitCost: number }[];
};

export type ReturnEntry = Base & {
  table: "return";
  kind: "customer" | "purchase";
  customerId?: Id;
  cardId?: Id;
  supplierId?: Id;
  refundTo?: Enum<typeof REFUND_TO_VALUES> | null;
  reason?: Enum<typeof RETURN_REASON_VALUES> | null;
  lines: { qty: number; unitAmount: number; unitCost: number }[];
};

export type MoneyEntry = Base & {
  type: Enum<typeof MONEY_TYPE_VALUES>;
  table: "money";
  amount: number;
  forMonth?: string | null; // "YYYY-MM" or the stored 1st "YYYY-MM-01"
  customerId?: Id;
  supplierId?: Id;
  cardId?: Id;
  personId?: Id;
  source?: "cash" | "card" | null;
  category?: string | null;
  cardCharged?: number | null;
  cashReceived?: number | null;
  settleMode?: Enum<typeof SETTLE_MODE_VALUES> | null;
  billMonthOverride?: string | null;
  emiMonths?: number | null;
  openingKind?: Enum<typeof OPENING_KIND_VALUES> | null;
};

export type Entry = PurchaseEntry | SaleEntry | ReturnEntry | MoneyEntry;

/**
 * The entry's effects on the books (SRS §5), with zero effects left out. A reversal
 * (`reversesId` set) is the same effects negated; its profit lands in its own date/for_month.
 * `partners` is needed only to split an opening correction's difference.
 */
export function postEntry(entry: Entry, partners: Partner[] = []): Effect[] {
  const effects = rawEffects(entry, partners).filter((e) => e.amount !== 0);
  if (!entry.reversesId) return effects;
  return effects.map((e) => ({ ...e, amount: 0 - e.amount })); // 0 - x, not -x: no -0
}

function rawEffects(entry: Entry, partners: Partner[]): Effect[] {
  switch (entry.table) {
    case "purchase":
      return purchase(entry, partners);
    case "sale":
      return sale(entry);
    case "return":
      return entry.kind === "customer" ? customerReturn(entry) : purchaseReturn(entry);
    case "money":
      return moneyEntry(entry, partners);
  }
}

function need<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`Missing ${what}`);
  return value;
}

const fx = (account: Account, amount: number, id?: Id): Effect =>
  id ? { account, amount, id } : { account, amount };
const on = (account: Account, id: Id, amount: number) => fx(account, amount, need(id, account));
const profit = (
  amount: number,
  monthOrDate: string,
  component: ProfitComponent,
  category?: string | null,
): Effect => ({
  account: "profit",
  amount,
  month: monthOf(monthOrDate),
  component,
  ...(category ? { category } : {}),
});
const sum = (amounts: number[]) => amounts.reduce(add, 0);

/** Opening difference D, split between the partners by profit share (SRS §5). */
function openingDiff(d: number, partners: Partner[]): Effect[] {
  if (partners.length === 0) throw new Error("Missing partners for the opening difference");
  const shares = splitShares(
    d,
    partners.map((p) => p.pct),
  );
  return partners.map((p, i) => fx("opening_diff", shares[i], p.id));
}

function purchase(p: PurchaseEntry, partners: Partner[]): Effect[] {
  const t = sum(p.lines.map((l) => mul(l.unitCost, l.qty)));
  const stock = fx("stock", t);
  switch (p.source) {
    case "cash":
      return [stock, fx("cash", 0 - t)];
    case "card": // EMI too: the full T counts in the balance at once
      return [stock, on("card", p.cardId, t)];
    case "supplier_credit":
      return [stock, on("supplier_due", p.supplierId, t)];
    case "customer_offset":
      return [stock, on("customer_due", p.customerId, 0 - t)];
    case "opening": // one-sided; the import's opening difference balances it
      return [stock];
    case "opening_correction": // a missed lot: an asset item, so D = +T
      return [stock, ...openingDiff(t, partners)];
  }
}

function sale(s: SaleEntry): Effect[] {
  const p = sum(s.lines.map((l) => mul(l.unitPrice, l.qty)));
  const c = sum(s.lines.map((l) => mul(l.unitCost, l.qty)));
  return [
    fx("stock", 0 - c),
    on("customer_due", s.customerId, p),
    profit(sub(p, c), s.date, "sale"),
  ];
}

function customerReturn(r: ReturnEntry): Effect[] {
  const pr = sum(r.lines.map((l) => mul(l.unitAmount, l.qty)));
  const cr = sum(r.lines.map((l) => mul(l.unitCost, l.qty)));
  return [
    fx("stock", cr),
    on("customer_due", r.customerId, 0 - pr),
    profit(sub(cr, pr), r.date, "customer_return"),
  ];
}

function purchaseReturn(r: ReturnEntry): Effect[] {
  // damaged_lost is the v1 write-off: refund 0, the whole cost is a loss.
  const refund =
    r.reason === "damaged_lost" ? 0 : sum(r.lines.map((l) => mul(l.unitAmount, l.qty)));
  const cr = sum(r.lines.map((l) => mul(l.unitCost, l.qty)));
  const effects = [fx("stock", 0 - cr), profit(sub(refund, cr), r.date, "purchase_return")];
  if (refund === 0) return effects;
  switch (need(r.refundTo, "refund_to")) {
    case "cash":
      return [...effects, fx("cash", refund)];
    case "card":
      return [...effects, on("card", r.cardId, 0 - refund)];
    case "supplier":
      return [...effects, on("supplier_due", r.supplierId, 0 - refund)];
    case "customer":
      return [...effects, on("customer_due", r.customerId, refund)];
  }
}

/** The single item an opening (or opening correction) states, by `opening_kind`. */
function openingItem(m: MoneyEntry, amount: number): Effect {
  switch (need(m.openingKind, "opening_kind")) {
    case "cash":
      return fx("cash", amount);
    case "customer_due":
      return on("customer_due", m.customerId, amount);
    case "supplier_due":
      return on("supplier_due", m.supplierId, amount);
    case "card_balance": // billing per bill month is the cards engine's job
      return on("card", m.cardId, amount);
    case "capital":
      return on("capital", m.personId, amount);
    case "profit_owed":
      return on("profit_owed", m.personId, amount);
    case "opening_difference":
      return on("opening_diff", m.personId, amount);
  }
}

function moneyEntry(m: MoneyEntry, partners: Partner[]): Effect[] {
  const a = m.amount;
  const customer = (x: number) => on("customer_due", m.customerId, x);
  const card = (x: number) => on("card", m.cardId, x);
  const capital = (x: number) => on("capital", m.personId, x);
  const owed = (x: number) => on("profit_owed", m.personId, x);
  /** Money leaving by `source`: cash −x, or the card's balance +x. */
  const paid = (x: number) => (need(m.source, "source") === "card" ? card(x) : fx("cash", 0 - x));
  const forMonth = m.forMonth ?? m.date;

  switch (m.type) {
    case "customer_payment":
      return [fx("cash", a), customer(0 - a)];
    case "customer_cash_given":
      return [fx("cash", 0 - a), customer(a)];
    case "customer_discount":
      return [customer(0 - a), profit(0 - a, m.date, "discount")];
    case "customer_profit_share": {
      const received = need(m.settleMode, "settle_mode") === "received";
      return [received ? fx("cash", a) : customer(a), profit(a, forMonth, "profit_share")];
    }
    case "supplier_payment":
      return [on("supplier_due", m.supplierId, 0 - a), paid(a)];
    case "card_payment":
      return [fx("cash", 0 - a), card(0 - a)];
    case "card_cash_out": {
      const charged = m.cardCharged ?? a;
      const received = need(m.cashReceived, "cash_received");
      return [fx("cash", received), card(charged), profit(sub(received, charged), m.date, "fee")];
    }
    case "card_fee":
      return [card(a), profit(0 - a, m.date, "fee")];
    case "cashback":
      return [paid(0 - a), profit(a, m.date, "cashback")];
    case "expense":
      return [paid(a), profit(0 - a, forMonth, "expense", m.category)];
    case "capital_in":
      return [fx("cash", a), capital(a)];
    case "capital_out": // D-060: by card, or cash (a stored null source is cash)
      return [m.source === "card" ? card(a) : fx("cash", 0 - a), capital(0 - a)];
    case "profit_paid":
      return [fx("cash", 0 - a), owed(0 - a)];
    case "profit_reinvested":
      return [capital(a), owed(0 - a)];
    case "opening": // one-sided; the import's opening difference balances it
      return [openingItem(m, a)];
    case "opening_correction": {
      if (m.openingKind === "opening_difference") {
        throw new Error("An opening correction can't target opening_difference");
      }
      // D keeps the row balanced: +X for an asset item, −X for a liability or equity item.
      const item = openingItem(m, a);
      return [item, ...openingDiff(SIDE[item.account] === "asset" ? a : 0 - a, partners)];
    }
  }
}
