import { type StatementLine, statementLines } from "./accounts";
import { monthOf } from "./dates";
import type { Books } from "./engine/index";
import { dueStatements } from "./engine/customers";
import type { Allocation } from "./engine/months";
import { add, sub } from "./money";

// UIDD §4.8 (task 4.5): the People list and a person's detail, read off `computeBooks` (capital,
// profit owed, opening difference) and the stored `allocations` of the closed months (SRS §7).
// Pure: nothing here computes a balance; the totals only split the engine's rows by entry type.

type SetupPerson = {
  id: string;
  name: string;
  kind: "partner" | "investor";
  profitSharePct: string | null;
  note: string | null;
  active: boolean;
};

export type PersonRow = SetupPerson & {
  capital: number;
  profitOwed: number;
  /** Their opening difference while it is unresolved (SRS §5), else null. */
  openingDifference: number | null;
};

/** Their share of the opening difference, shown until its net total is 0 (SRS §5). */
export function openingDifferenceOf(books: Books, id: string): number | null {
  const d = books.openingDifference;
  return d.resolved ? null : (d.byPerson[id] ?? null);
}

/** One row per person, in Setup's order (by name). */
export function peopleRows(people: SetupPerson[], books: Books): PersonRow[] {
  return people.map((p) => ({
    ...p,
    capital: books.capital[p.id] ?? 0,
    profitOwed: books.profitOwed[p.id] ?? 0,
    openingDifference: openingDifferenceOf(books, p.id),
  }));
}

/** Profit owed = allocated + opening − paid − reinvested (SRS §7); each part ≥ 0 unless a loss. */
export type ProfitSummary = {
  allocated: number;
  opening: number;
  paid: number;
  reinvested: number;
  owed: number;
};

export type PersonDetail = {
  /** Capital in/out, reinvested and opening capital; newest first with the running balance. */
  capital: StatementLine[];
  /** The closed months' allocation rows, newest first. */
  allocations: Allocation[];
  /** Every entry that moved their profit owed (paid, reinvested, opening), newest first. */
  profitMoves: StatementLine[];
  profit: ProfitSummary;
};

/**
 * A person's detail as of `asOf`. `typeOf` gives an entry's type (the Journal's: "profit_paid",
 * "profit_reinvested", "opening", …) to split the profit owed moves into paid / reinvested /
 * opening.
 */
export function personDetail(
  id: string,
  books: Books,
  allocations: Allocation[],
  asOf: string,
  typeOf: (entryId: string) => string | undefined,
): PersonDetail {
  const closed = new Set(books.months.filter((m) => m.closed).map((m) => m.month));
  const mine = allocations
    .filter((a) => a.personId === id && closed.has(monthOf(a.month)))
    .map((a) => ({ ...a, month: monthOf(a.month) }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.kind.localeCompare(b.kind));
  const owed = dueStatements(books.posted, "profit_owed", asOf)[id];

  let [paid, reinvested, opening] = [0, 0, 0];
  for (const r of owed?.rows ?? []) {
    const type = typeOf(r.entryId);
    if (type === "profit_paid") paid = sub(paid, r.amount);
    else if (type === "profit_reinvested") reinvested = sub(reinvested, r.amount);
    else opening = add(opening, r.amount);
  }

  return {
    capital: statementLines(dueStatements(books.posted, "capital", asOf)[id]),
    allocations: mine,
    profitMoves: statementLines(owed),
    profit: {
      allocated: mine.reduce((n, a) => add(n, a.amount), 0),
      opening,
      paid,
      reinvested,
      owed: books.profitOwed[id] ?? 0,
    },
  };
}
