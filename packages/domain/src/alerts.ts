// SRS §15 (D-079, D-081): the Alerts bell's list, derived from the books on every request; nothing
// is stored or dismissed. Pure and outside `engine/`: it only picks and compares figures the
// engine and the views already hold (the card's balance and Available ≈, a bill's remaining, a
// customer's balance, profit owed). Integer poisha.
import { available } from "./card-view";
import { standing } from "./charts/kinds";
import { type AgeLot, stockAge } from "./charts/stock";
import { cardAlerts, daysLeft } from "./dashboard";
import { addMonths, daysBetween, formatDate, formatMonth, monthOf } from "./dates";
import { type BillDates, type Card, billDates, billMonthOf } from "./engine/cards";
import type { Books, BooksData, StoredEntry } from "./engine/index";
import { nextToClose } from "./engine/months";
import type { MoneyEntry } from "./engine/post";
import type { Alert, AlertLevel } from "./alert-level";
import { alertText as t } from "./help-text";
import { add, format, parse, sub } from "./money";
import { dueText } from "./setup";

export type { Alert, AlertKind, AlertLevel } from "./alert-level";
export { badgeCount } from "./alert-level";

/** What the rules read from Setup (a subset of `loadSetup()`). */
export type AlertSetup = {
  cards: { id: string; display: string; creditLimit: string | null; active: boolean }[];
  people: { id: string; name: string }[];
  customers: { id: string; display: string; isSystem: boolean }[];
};

export const FEE_DAYS = 15;
export const FEE_URGENT_DAYS = 3;
/** D-081: with the fee amount unknown, less room than ৳10,000 counts as short (no figure shown). */
export const FEE_UNKNOWN_ROOM = 1_000_000;
export const BILL_SOON_DAYS = 7;
export const DUE_SOON_DAYS = 30;
export const DUE_URGENT_DAYS = 60;
/** D-081: an unclosed month is Urgent from this day of the next month, Soon before it. */
export const CLOSE_URGENT_DAY = 5;
/** `stockAge`'s band of lots older than 90 days. */
const OLD_STOCK = "91";

const RANK: Record<AlertLevel, number> = { urgent: 0, soon: 1, fyi: 2 };
const day = (date: string) => formatDate(date).slice(0, 6); // "15 Jan"
type Money = Extract<StoredEntry, { table: "money" }>;

export function buildAlerts(i: {
  data: BooksData;
  books: Books;
  setup: AlertSetup;
  /** Card id → its saved expiry's month (1–12), from `expiryMonths()`. */
  feeMonths: Record<string, number>;
  lots: AgeLot[];
  today: string;
}): { alerts: Alert[]; noExpiryCards: number } {
  const alerts = [
    ...feeAlerts(i),
    ...billAlerts(i.books, i.setup, i.today),
    ...customerAlerts(i.data, i.books, i.setup, i.today),
    ...closeAlerts(i.data, i.today),
    ...stockAlerts(i.lots, i.today),
    ...profitAlerts(i.books, i.setup, i.today),
  ].sort(
    (a, b) =>
      RANK[a.level] - RANK[b.level] ||
      a.date.localeCompare(b.date) ||
      a.title.localeCompare(b.title),
  );
  const noExpiryCards = i.setup.cards.filter((c) => c.active && !i.feeMonths[c.id]).length;
  return { alerts, noExpiryCards };
}

/** One card's bill-date overrides, keyed by bill month (as `cardSummaries` builds them). */
const overridesOf = (all: BillDates[], cardId: string) =>
  new Map(all.filter((o) => o.cardId === cardId).map((o) => [monthOf(o.billMonth), o]));

/** The first bill month in the expiry month whose statement date is today or later. */
function feeMonth(card: Card, expiry: number, today: string, overrides: Map<string, BillDates>) {
  let m = addMonths(monthOf(today), -1); // an actual statement may fall in the next month
  while (Number(m.slice(5)) !== expiry || billDates(card, m, overrides).statementDate < today)
    m = addMonths(m, 1);
  return m;
}

function feeAlerts(i: Parameters<typeof buildAlerts>[0]): Alert[] {
  const fees = standing(i.data.entries, "card_fee") as Money[];
  return i.setup.cards.flatMap((c): Alert[] => {
    const expiry = i.feeMonths[c.id];
    const card = i.data.cards.find((k) => k.id === c.id);
    if (!c.active || !expiry || !card) return [];
    const overrides = overridesOf(i.data.billDates, c.id);
    const m = feeMonth(card, expiry, i.today, overrides);
    const date = billDates(card, m, overrides).statementDate;
    const days = daysBetween(i.today, date);
    if (days > FEE_DAYS) return [];
    const mine = fees.filter((e) => e.cardId === c.id);
    const billOf = (e: MoneyEntry) => billMonthOf(card, e.date, e.billMonthOverride, overrides);
    // D-081: this year's fee is already on the card, so Available ≈ already holds it.
    if (mine.some((e) => e.category === "annual" && billOf(e) === m)) return [];
    const last = mine.filter(
      (e) => (e.category === "annual" || e.category === "vat") && billOf(e) === addMonths(m, -12),
    );
    const amount = last.length ? last.map((e) => e.amount).reduce(add, 0) : null;
    const limit = c.creditLimit == null ? null : parse(c.creditLimit);
    const room = available(limit, i.books.cards[c.id]?.balance ?? 0);
    const short = room != null && room < (amount ?? FEE_UNKNOWN_ROOM);
    const roomText = room == null ? null : format(room);
    const detail =
      amount == null
        ? t.feeUnknown(day(date), roomText)
        : t.feeKnown(
            format(amount),
            day(date),
            roomText,
            short && room != null ? format(sub(amount, room)) : null,
          );
    const level = short && days <= FEE_URGENT_DAYS ? "urgent" : "soon";
    const title = t.feeTitle(c.display);
    return [{ level, kind: "card_fee", title, detail, href: `/cards/${c.id}`, date, cardId: c.id }];
  });
}

function billAlerts(books: Books, setup: AlertSetup, today: string): Alert[] {
  return cardAlerts(books.cards, today, Infinity).flatMap((a): Alert[] => {
    if (a.daysLeft > BILL_SOON_DAYS) return [];
    const name = setup.cards.find((c) => c.id === a.cardId)?.display ?? "Card";
    return [
      {
        level: a.daysLeft <= 0 ? "urgent" : "soon",
        kind: "card_bill",
        title: t.billTitle(name),
        detail: t.bill(format(a.amount), day(a.dueDate), daysLeft(a.daysLeft)),
        href: `/cards/${a.cardId}`,
        date: a.dueDate,
        cardId: a.cardId,
      },
    ];
  });
}

function customerAlerts(data: BooksData, books: Books, setup: AlertSetup, today: string): Alert[] {
  const lastPaid = new Map<string, string>();
  for (const e of standing(data.entries, "customer_payment") as Money[]) {
    const prev = e.customerId ? lastPaid.get(e.customerId) : undefined;
    if (e.customerId && e.date <= today && (!prev || e.date > prev))
      lastPaid.set(e.customerId, e.date);
  }
  return setup.customers.flatMap((c): Alert[] => {
    const statement = books.customers[c.id];
    if (c.isSystem || !statement || statement.balance <= 0) return [];
    const paid = lastPaid.get(c.id);
    const since = paid ?? statement.rows[0]?.date ?? today;
    const days = daysBetween(since, today);
    if (days < DUE_SOON_DAYS) return [];
    return [
      {
        level: days >= DUE_URGENT_DAYS ? "urgent" : "soon",
        kind: "customer",
        title: t.dueTitle(c.display),
        detail: t.due(dueText(statement.balance), days, paid != null),
        href: `/customers/${c.id}`,
        date: since,
      },
    ];
  });
}

function closeAlerts(data: BooksData, today: string): Alert[] {
  const m = nextToClose(data.closed, data.entries[0]?.date ?? null, today);
  if (m >= monthOf(today)) return [];
  const next = addMonths(m, 1);
  const urgentFrom = `${next}-${String(CLOSE_URGENT_DAY).padStart(2, "0")}`;
  return [
    {
      level: today >= urgentFrom ? "urgent" : "soon",
      kind: "close",
      title: t.closeTitle(formatMonth(m)),
      detail: t.close(formatMonth(m)),
      href: `/months/${m}`,
      date: `${next}-01`,
    },
  ];
}

function stockAlerts(lots: AgeLot[], today: string): Alert[] {
  const old = stockAge(lots, {}, today).find((a) => a.key === OLD_STOCK);
  if (!old || old.units <= 0) return [];
  return [
    {
      level: "fyi",
      kind: "stock",
      title: t.stockTitle,
      detail: t.stock(old.units),
      href: "/stock",
      date: today,
    },
  ];
}

function profitAlerts(books: Books, setup: AlertSetup, today: string): Alert[] {
  return setup.people.flatMap((p): Alert[] => {
    const owed = books.profitOwed[p.id] ?? 0;
    if (owed <= 0) return [];
    return [
      {
        level: "fyi",
        kind: "profit",
        title: t.profitTitle(p.name),
        detail: t.profit(format(owed)),
        href: `/people/${p.id}`,
        date: today,
      },
    ];
  });
}
