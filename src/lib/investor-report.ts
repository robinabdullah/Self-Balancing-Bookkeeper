import { type StatementLine, statementRange, statementRowsOf } from "@/lib/accounts";
import { type CardRow, cardRows, creditSplit } from "@/lib/card-view";
import { addDays, addMonths, clampDay, monthDiff, monthOf } from "@/lib/dates";
import type { Books } from "@/lib/engine/index";
import { dueStatements } from "@/lib/engine/customers";
import type { Allocation } from "@/lib/engine/months";
import { add, sub } from "@/lib/money";
import { openingDifferenceOf } from "@/lib/people-view";

// D-045 (UIDD §4.17): the Investor / Partner report for whole months, read off the books as on
// the period's last day (`atEnd`), except the profit paid / reinvested since the period start and
// the profit owed now (`books`, today). Pure: it only picks and sums the books' own rows; every
// total ties out (capital closing = `atEnd.capital`, the roll-forward = `books.profitOwed`).

type Person = {
  id: string;
  name: string;
  kind: "partner" | "investor";
  profitSharePct: string | null;
};

type SetupCard = Parameters<typeof cardRows>[0][number] & { ownerPersonId: string };

export type CapitalGroup = { label: string; amount: number };

export type MonthAllocations = {
  month: string;
  /** Closed: its stored rows for this person (maybe none); open: null ("not allocated yet"). */
  rows: Allocation[] | null;
  /** The month-end capital, when the stored cash basis differs from it ("basis set at close"). */
  basisNote: boolean;
};

export type InvestorReport = {
  person: Person;
  from: string;
  to: string;
  capital: { opening: number; groups: CapitalGroup[]; closing: number };
  cards: (CardRow & { remainingEmi: number })[];
  /** Card payments made on their cards in the period (net of reversals). */
  cardPayments: number;
  months: MonthAllocations[];
  profit: {
    /** Owed before the period: allocations of earlier months and moves before `from`. */
    before: number;
    /** Allocated for the period's closed months. */
    allocated: number;
    /** Allocated for closed months after the period. */
    later: number;
    /** Opening profit owed and its corrections, from `from` to today. */
    other: number;
    /** Paid and reinvested from `from` to today, each line as a positive amount. */
    paid: StatementLine[];
    reinvested: StatementLine[];
    owedNow: number;
  };
  partner: { sharePct: number | null; openingDifference: number | null } | null;
  /** The period reaches an open month: its figures can still change. */
  open: boolean;
};

// D-060: a Capital out paid by card (it moved a card) is "Taken out (card)".
const GROUPS: [string, string][] = [
  ["capital_in", "Added"],
  ["profit_reinvested", "Reinvested"],
  ["capital_out", "Taken out (cash)"],
  ["capital_out_card", "Taken out (card)"],
];
const OTHER = "Opening & corrections";

/** Each month from `from`'s to `to`'s. */
export const monthsOf = (from: string, to: string) =>
  Array.from({ length: monthDiff(monthOf(from), monthOf(to)) + 1 }, (_, i) =>
    addMonths(monthOf(from), i),
  );

export function investorReport(input: {
  person: Person;
  /** The books as of today. */
  books: Books;
  /** The books as on the period's last day (today when the period runs to today). */
  atEnd: Books;
  /** The books as on the day before the period. */
  beforeFrom: Books;
  allocations: Allocation[];
  /** The months with a `month_closes` row. */
  closed: string[];
  /** Their cards (`ownerPersonId`). */
  cards: SetupCard[];
  from: string;
  to: string;
  today: string;
  typeOf: (entryId: string) => string | undefined;
}): InvestorReport {
  const { person, books, atEnd, from, to, today, typeOf } = input;
  const end = to < today ? to : today;
  const id = person.id;

  // Capital: the period's lines grouped by type, signed (a reversal keeps its original's type).
  const capitalRows = statementRowsOf("person", id, books, today);
  const range = statementRange(capitalRows, from, end);
  const onCard = new Set(
    books.posted.filter((p) => p.effects.some((e) => e.account === "card")).map((p) => p.id),
  );
  const groupOf = (entryId: string) => {
    const type = typeOf(entryId);
    return type === "capital_out" && onCard.has(entryId) ? "capital_out_card" : type;
  };
  const sums = new Map<string, number>();
  for (const l of range.lines) {
    const label = GROUPS.find(([t]) => t === groupOf(l.entryId))?.[1] ?? OTHER;
    sums.set(label, add(sums.get(label) ?? 0, l.amount));
  }
  const groups = [...GROUPS.map(([, label]) => label), OTHER]
    .filter((label) => (sums.get(label) ?? 0) !== 0)
    .map((label) => ({ label, amount: sums.get(label) ?? 0 }));

  // Their cards as on the period end; a card with no move by then is left out.
  const owned = input.cards.filter(
    (c) => c.ownerPersonId === id && (atEnd.cards[c.id]?.moves.length ?? 0) > 0,
  );
  const cards = cardRows(owned, atEnd.cards).map((c) => ({
    ...c,
    remainingEmi: atEnd.cards[c.id]?.remainingEmi ?? 0,
  }));
  const cardPayments = owned.reduce(
    (n, c) => add(n, creditSplit(atEnd.cards[c.id]?.moves ?? [], from, end, typeOf).payments),
    0,
  );

  // Allocations per month of the period, and the later closed months for the roll-forward.
  const closed = new Set(input.closed.map(monthOf));
  const mine = input.allocations.filter((a) => a.personId === id);
  const rowsOf = (m: string) =>
    mine.filter((a) => monthOf(a.month) === m).map((a) => ({ ...a, month: m }));
  const capitalAt = (m: string) => statementRange(capitalRows, from, clampDay(m, 31)).closing;
  const months = monthsOf(from, to).map((m) => {
    const rows = closed.has(m) ? rowsOf(m) : null;
    const cash = rows?.find((r) => r.kind === "cash");
    return { month: m, rows, basisNote: cash?.basis != null && cash.basis !== capitalAt(m) };
  });
  const sum = (as: Allocation[]) => as.reduce((n, a) => add(n, a.amount), 0);
  const allocated = sum(months.flatMap((m) => m.rows ?? []));
  const later = sum(
    mine.filter((a) => closed.has(monthOf(a.month)) && monthOf(a.month) > monthOf(to)),
  );

  // Profit owed moves from the period start to today: paid, reinvested, and the rest.
  const moves = (dueStatements(books.posted, "profit_owed", today)[id]?.rows ?? []).filter(
    (r) => r.date >= from,
  );
  const line = (r: (typeof moves)[number]): StatementLine => ({
    ...r,
    amount: 0 - r.amount,
    up: null,
    down: null,
  });
  const paid = moves.filter((r) => typeOf(r.entryId) === "profit_paid").map(line);
  const reinvested = moves.filter((r) => typeOf(r.entryId) === "profit_reinvested").map(line);
  const other = moves
    .filter((r) => !["profit_paid", "profit_reinvested"].includes(typeOf(r.entryId) ?? ""))
    .reduce((n, r) => add(n, r.amount), 0);

  return {
    person,
    from,
    to,
    capital: { opening: range.opening, groups, closing: range.closing },
    cards,
    cardPayments,
    months,
    profit: {
      before: input.beforeFrom.profitOwed[id] ?? 0,
      allocated,
      later,
      other,
      paid,
      reinvested,
      owedNow: books.profitOwed[id] ?? 0,
    },
    partner:
      person.kind === "partner"
        ? {
            sharePct: person.profitSharePct == null ? null : Number(person.profitSharePct),
            openingDifference: openingDifferenceOf(atEnd, id),
          }
        : null,
    open: months.some((m) => m.rows == null),
  };
}

/** The roll-forward's own sum: before + allocated + later + other − paid − reinvested. */
export function owedBySum(p: InvestorReport["profit"]) {
  const out = [...p.paid, ...p.reinvested].reduce((n, l) => add(n, l.amount), 0);
  return sub(add(add(p.before, p.allocated), add(p.later, p.other)), out);
}

/** The day before `from` (the roll-forward's "owed before"). */
export const dayBefore = (from: string) => addDays(from, -1);
