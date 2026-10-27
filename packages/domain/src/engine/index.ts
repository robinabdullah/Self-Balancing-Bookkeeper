// computeBooks (SRS §2): the one entry point from the stored facts to every derived balance. It
// posts each entry once (`postEntry`, SRS §5) and hands the effects to the views. Pure: plain
// arrays in, plain objects out; `asOf` is passed in.
import { type Balance, balance } from "./balance";
import { type BillDates, type Card, type CardSummary, cardSummaries } from "./cards";
import { type Statement, dueStatements } from "./customers";
import { type Allocation, type MonthRow, profitBooks } from "./months";
import { type Entry, type Partner, type Posted, postEntry } from "./post";

/** A stored entry: its row id and `created_at` (ties within a date). */
export type StoredEntry = Entry & { id: string; createdAt: string };

/** Every fact the engine needs; `closed` = the months with a `month_closes` row. */
export type BooksData = {
  entries: StoredEntry[];
  partners: Partner[];
  allocations: Allocation[];
  closed: string[];
  cards: Card[];
  billDates: BillDates[];
};

export type Books = Balance & {
  posted: Posted[];
  customers: Record<string, Statement>;
  suppliers: Record<string, Statement>;
  cards: Record<string, CardSummary>;
  months: MonthRow[];
};

/** The entry's effects, plus the card fields its bills need (SRS §6). */
export function toPosted(entry: StoredEntry, partners: Partner[]): Posted {
  const card =
    entry.table === "purchase" || entry.table === "money"
      ? { billMonthOverride: entry.billMonthOverride, emiMonths: entry.emiMonths }
      : {};
  return {
    id: entry.id,
    date: entry.date,
    createdAt: entry.createdAt,
    effects: postEntry(entry, partners),
    reversesId: entry.reversesId ?? null,
    ...card,
  };
}

/** The books as of `asOf`, from the entries dated on or before it. */
export function computeBooks(data: BooksData, asOf: string): Books {
  const posted = data.entries.map((e) => toPosted(e, data.partners));
  const profit = profitBooks(posted, data.allocations, data.closed, asOf);
  return {
    ...balance(posted, profit, asOf),
    posted,
    customers: dueStatements(posted, "customer_due", asOf),
    suppliers: dueStatements(posted, "supplier_due", asOf),
    cards: cardSummaries(posted, data.cards, data.billDates, asOf),
    months: profit.months,
  };
}
