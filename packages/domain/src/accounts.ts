import { type Statement, type StatementRow, dueStatements } from "./engine/customers";
import type { Books } from "./engine/index";
import type { Posted } from "./engine/post";
import { add, format } from "./money";

// UIDD §4.8 (task 4.3): the Customers and Suppliers lists and statements, read off the engine's
// `dueStatements`. Pure: nothing here computes a balance, only picks, filters and orders them.

/** One list row: its balance and last activity (the latest entry that moved the due). */
export type AccountRow = {
  id: string;
  name: string;
  /** What the search matches: name parts and phone. */
  terms: (string | null)[];
  balance: number;
  lastActivity: string | null;
  badge?: string;
};

/** Every row with its statement's balance and last date; search matches any term, any case. */
export function accountRows(
  rows: Omit<AccountRow, "balance" | "lastActivity">[],
  statements: Record<string, Statement>,
): AccountRow[] {
  return rows
    .map((r) => {
      const s = statements[r.id];
      return { ...r, balance: s?.balance ?? 0, lastActivity: s?.rows.at(-1)?.date ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function searchRows(rows: AccountRow[], search: string): AccountRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.terms.some((t) => t?.toLowerCase().includes(q)));
}

/**
 * A statement row split into `up` (the due goes up) and `down` (it goes down). A customer's up is
 * the debit column; a supplier's up (we owe more) is the credit column.
 */
export type StatementLine = StatementRow & { up: number | null; down: number | null };

const split = (r: StatementRow): StatementLine => ({
  ...r,
  up: r.amount > 0 ? r.amount : null,
  down: r.amount < 0 ? 0 - r.amount : null,
});

/** Newest first, as on a phone; each row keeps the running balance after it. */
export function statementLines(statement: Statement | undefined): StatementLine[] {
  return (statement?.rows ?? []).map(split).reverse();
}

/** The four kinds of account a statement is shown for (D-040). */
export type StatementKind = "customer" | "supplier" | "card" | "person";

type RangeRow = { entryId: string; date: string; amount: number };

/**
 * An account's rows, oldest first, read off the books as of `asOf`: a customer's or supplier's
 * due, a person's capital, a card's charges (+) and credits (−).
 */
export function statementRowsOf(
  kind: StatementKind,
  id: string,
  books: Books,
  asOf: string,
): RangeRow[] {
  if (kind === "customer") return books.customers[id]?.rows ?? [];
  if (kind === "supplier") return books.suppliers[id]?.rows ?? [];
  if (kind === "person") return dueStatements(books.posted, "capital", asOf)[id]?.rows ?? [];
  return [...(books.cards[id]?.moves ?? [])]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ entryId, date, amount }) => ({ entryId, date, amount }));
}

export type StatementRange = {
  /** The balance before `from`. */
  opening: number;
  /** The entries from `from` to `to`, oldest first, each with the balance after it. */
  lines: StatementLine[];
  /** The period's totals: what moved the balance up, and down. */
  up: number;
  down: number;
  /** The balance at the end of `to`: opening + the lines. */
  closing: number;
};

/** D-040: a statement for a period (both days included), from rows in date order. */
export function statementRange(rows: RangeRow[], from: string, to: string): StatementRange {
  let [balance, opening, up, down] = [0, 0, 0, 0];
  const lines: StatementLine[] = [];
  for (const r of rows) {
    if (r.date > to) continue;
    balance = add(balance, r.amount);
    if (r.date < from) {
      opening = balance;
      continue;
    }
    const line = split({ ...r, balance });
    up = add(up, line.up ?? 0);
    down = add(down, line.down ?? 0);
    lines.push(line);
  }
  return { opening, lines, up, down, closing: balance };
}

/**
 * D-040: a customer's due just before an entry, just after it, and today's when later entries
 * exist (else null). Entries saved together (a sale and its "Received now" payment: the same date
 * and saved time) count as one, in the books' order: date, then saved time.
 */
export function duesAround(
  posted: Posted[],
  customerId: string,
  at: { date: string; createdAt: string },
): { previous: number; now: number; today: number | null } {
  let [previous, same, later, newer] = [0, 0, 0, false];
  for (const p of posted) {
    const order = p.date.localeCompare(at.date) || p.createdAt.localeCompare(at.createdAt);
    for (const e of p.effects) {
      if (e.account !== "customer_due" || e.id !== customerId) continue;
      if (order < 0) previous = add(previous, e.amount);
      else if (order === 0) same = add(same, e.amount);
      else [later, newer] = [add(later, e.amount), true];
    }
  }
  const now = add(previous, same);
  return { previous, now, today: newer ? add(now, later) : null };
}

/** UIDD §2 wording for a supplier's due: "We owe ৳X", "Credit ৳X" (an advance), "No due". */
export function supplierDueText(poisha: number) {
  if (poisha > 0) return `We owe ${format(poisha)}`;
  if (poisha < 0) return `Credit ${format(0 - poisha)}`;
  return "No due";
}

/** A bill's profit: its own profit effects from `postEntry` (SRS §5), never a second formula. */
export function billProfit(posted: Posted | undefined): number {
  return (posted?.effects ?? [])
    .filter((e) => e.account === "profit")
    .reduce((n, e) => add(n, e.amount), 0);
}
