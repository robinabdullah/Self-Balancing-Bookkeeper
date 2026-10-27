// Card statements (SRS §6, a port of Nadim's "Billing Dates" sheet): each card's bills, what the
// credits have paid, next due and status. Charges and credits come only from `postEntry` card
// effects (SRS §5): + = a charge, − = a credit. A reversed entry and its reversal both drop out of
// the bills once the reversal is dated on or before `asOf` (D-058); the balance still sums both.
// Pure; integer poisha.
import { addDays, addMonths, clampDay, monthOf } from "@/lib/dates";
import type { Posted } from "@/lib/engine/post";
import { add, splitEven, sub } from "@/lib/money";

export type Card = { id: string; statementDay: number; dueDay: number };

/** A `card_bill_dates` row: the bank's real dates for one bill month (overrides only). */
export type BillDates = {
  cardId: string;
  billMonth: string; // "YYYY-MM" or the stored 1st
  actualStatementDate?: string | null;
  actualDueDate?: string | null;
};

/** One bill's dates; `*Actual` = taken from `card_bill_dates`, otherwise estimated. */
export type BillDatesUsed = {
  statementDate: string;
  dueDate: string;
  statementActual: boolean;
  dueActual: boolean;
};

export type Bill = BillDatesUsed & {
  month: string;
  amount: number;
  paid: number;
  remaining: number;
};

export type CardStatus =
  | "check_dates"
  | "card_credit"
  | "clear"
  | "overdue"
  | "due_today"
  | "due_within_7_days"
  | "upcoming";

/**
 * One card effect of an entry: + a charge (with its bill month), − a credit (no bill month). D-058:
 * a reversed entry (`reversed`) and its reversal (`reversal`) are on no bill.
 */
export type CardMove = {
  entryId: string;
  date: string;
  amount: number;
  billMonth: string | null;
  reversed?: boolean;
  reversal?: boolean;
};

/** An EMI purchase: `billed` = the installments whose statement is out; the rest `remaining`. */
export type EmiPlan = {
  entryId: string;
  date: string;
  total: number;
  months: number;
  billed: number;
  remaining: number;
};

export type CardSummary = {
  balance: number; // negative = card credit
  bills: Bill[]; // oldest bill month first
  moves: CardMove[]; // in posting order
  emiPlans: EmiPlan[];
  nextDue: { date: string; amount: number } | null;
  overdue: number;
  dueWithin7Days: number;
  unbilled: number;
  remainingEmi: number;
  status: CardStatus;
};

/** One card's overrides, keyed by bill month. */
type Overrides = Map<string, BillDates>;

/** Statement and due dates of a card's bill month (SRS §6.1–2). */
export function billDates(card: Card, month: string, overrides?: Overrides): BillDatesUsed {
  const o = overrides?.get(month);
  const statementDate = o?.actualStatementDate ?? clampDay(month, card.statementDay);
  const sameMonth = clampDay(monthOf(statementDate), card.dueDay);
  const estimatedDue =
    sameMonth > statementDate
      ? sameMonth
      : clampDay(addMonths(monthOf(statementDate), 1), card.dueDay);
  return {
    statementDate,
    dueDate: o?.actualDueDate ?? estimatedDue,
    statementActual: o?.actualStatementDate != null,
    dueActual: o?.actualDueDate != null,
  };
}

/** The bill month of a charge: the override, or the earliest bill whose statement ≥ the date. */
export function billMonthOf(
  card: Card,
  date: string,
  override?: string | null,
  overrides?: Overrides,
): string {
  if (override) return monthOf(override);
  let month = addMonths(monthOf(date), -1); // an actual statement may fall in the next month
  while (billDates(card, month, overrides).statementDate < date) month = addMonths(month, 1);
  return month;
}

/** Each card's summary as of `asOf`, from the entries dated on or before it. */
export function cardSummaries(
  posted: Posted[],
  cards: Card[],
  allOverrides: BillDates[],
  asOf: string,
): Record<string, CardSummary> {
  // D-058: the pairs whose reversal is dated on or before `asOf` (both ids).
  const cancelled = new Set(
    posted.flatMap((p) => (p.reversesId && p.date <= asOf ? [p.id, p.reversesId] : [])),
  );
  const out: Record<string, CardSummary> = {};
  for (const card of cards) {
    const overrides: Overrides = new Map(
      allOverrides.filter((o) => o.cardId === card.id).map((o) => [monthOf(o.billMonth), o]),
    );
    out[card.id] = summary(card, posted, overrides, cancelled, asOf);
  }
  return out;
}

function summary(
  card: Card,
  posted: Posted[],
  overrides: Overrides,
  cancelled: Set<string>,
  asOf: string,
): CardSummary {
  const charged = new Map<string, number>(); // bill month → Σ charges
  const charge = (month: string, amount: number) =>
    charged.set(month, add(charged.get(month) ?? 0, amount));
  let credits = 0;
  const moves: CardMove[] = [];
  const emiPlans: EmiPlan[] = [];

  for (const p of posted) {
    if (p.date > asOf) continue;
    for (const e of p.effects) {
      if (e.account !== "card" || e.id !== card.id) continue;
      if (cancelled.has(p.id)) {
        const flag = p.reversesId ? { reversal: true } : { reversed: true };
        moves.push({ entryId: p.id, date: p.date, amount: e.amount, billMonth: null, ...flag });
        continue;
      }
      if (e.amount < 0) {
        credits = sub(credits, e.amount);
        moves.push({ entryId: p.id, date: p.date, amount: e.amount, billMonth: null });
        continue;
      }
      const m0 = billMonthOf(card, p.date, p.billMonthOverride, overrides);
      moves.push({ entryId: p.id, date: p.date, amount: e.amount, billMonth: m0 });
      // EMI: installment k is billed in m0 + k; the full amount is in the balance at once.
      const months = p.emiMonths != null && p.emiMonths > 1 ? p.emiMonths : 1;
      let remaining = 0; // installments not billed yet
      splitEven(e.amount, months).forEach((part, k) => {
        const month = addMonths(m0, k);
        charge(month, part);
        if (billDates(card, month, overrides).statementDate > asOf)
          remaining = add(remaining, part);
      });
      if (months > 1) {
        const plan = { entryId: p.id, date: p.date, total: e.amount, months };
        emiPlans.push({ ...plan, billed: sub(e.amount, remaining), remaining });
      }
    }
  }

  // Credits pour into bills oldest bill month first, whatever their date (SRS §6.5).
  let left = credits;
  const bills: Bill[] = [...charged.keys()].sort().map((month) => {
    const amount = charged.get(month) ?? 0;
    const paid = Math.min(amount, left);
    left = sub(left, paid);
    return {
      month,
      ...billDates(card, month, overrides),
      amount,
      paid,
      remaining: sub(amount, paid),
    };
  });
  const balance = moves.reduce((n, m) => add(n, m.amount), 0); // a cancelled pair nets to 0

  const unpaid = bills.filter((b) => b.remaining > 0);
  const sumRemaining = (bs: Bill[]) => bs.reduce((n, b) => add(n, b.remaining), 0);
  const week = addDays(asOf, 7);
  const next = unpaid.find((b) => b.dueDate >= asOf); // D-021: overdue bills aren't "next"
  const overdue = sumRemaining(unpaid.filter((b) => b.dueDate < asOf));

  return {
    balance,
    bills,
    moves,
    emiPlans,
    nextDue: next ? { date: next.dueDate, amount: next.remaining } : null,
    overdue,
    dueWithin7Days: sumRemaining(unpaid.filter((b) => b.dueDate >= asOf && b.dueDate <= week)),
    unbilled: bills.filter((b) => b.statementDate > asOf).reduce((n, b) => add(n, b.amount), 0),
    remainingEmi: emiPlans.reduce((n, plan) => add(n, plan.remaining), 0),
    status: status(card, bills, overrides, balance, overdue, next?.dueDate, asOf, week),
  };
}

function status(
  card: Card,
  bills: Bill[],
  overrides: Overrides,
  balance: number,
  overdue: number,
  nextDue: string | undefined,
  asOf: string,
  week: string,
): CardStatus {
  const months = new Set([...bills.map((b) => b.month), ...overrides.keys()]);
  const badDates = [...months].some((month) => {
    const d = billDates(card, month, overrides);
    return monthOf(d.statementDate) !== month || d.dueDate <= d.statementDate;
  });
  if (badDates) return "check_dates";
  if (balance < 0) return "card_credit";
  if (balance === 0) return "clear";
  if (overdue > 0) return "overdue";
  if (nextDue === asOf) return "due_today";
  if (nextDue && nextDue <= week) return "due_within_7_days";
  return "upcoming";
}
