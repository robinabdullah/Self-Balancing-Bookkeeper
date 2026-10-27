import type { CardNetwork } from "@/lib/banks";
import { addMonths, formatMonth } from "@/lib/dates";
import type { Bill, CardMove, CardStatus, CardSummary, EmiPlan } from "@/lib/engine/cards";
import { add, parse, splitEven, sub } from "@/lib/money";
import { installments } from "@/lib/preview";
import { cardTitle } from "@/lib/setup";

// UIDD §4.8 (task 4.4): the Cards summary table and a card's detail, read off the engine's
// `cardSummaries` (SRS §6). Pure: nothing here computes a bill or a balance, only picks and orders.

/** UIDD §6: a status badge always has text; the colour only backs it up. */
export const STATUS: Record<CardStatus, { label: string; tone: string }> = {
  check_dates: {
    label: "Check dates",
    tone: "border-amber-500 text-amber-800 dark:text-amber-300",
  },
  card_credit: { label: "Card credit", tone: "border-sky-500 text-sky-800 dark:text-sky-300" },
  clear: { label: "Clear", tone: "border-emerald-500 text-emerald-800 dark:text-emerald-300" },
  overdue: {
    label: "Overdue",
    tone: "border-destructive bg-destructive text-destructive-foreground",
  },
  due_today: { label: "Due today", tone: "border-destructive text-destructive" },
  due_within_7_days: {
    label: "Due within 7 days",
    tone: "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  upcoming: { label: "Upcoming", tone: "text-muted-foreground" },
};

type SetupCard = {
  id: string;
  name: string;
  network: CardNetwork;
  ownerPersonId: string;
  owner: string;
  display: string;
  statementDay: number;
  dueDay: number;
  /** As stored ("500000.00"), or null when no limit is set. */
  creditLimit: string | null;
  active: boolean;
};

export type CardRow = Omit<SetupCard, "creditLimit" | "ownerPersonId"> &
  Pick<CardSummary, "balance" | "nextDue" | "overdue" | "status"> & {
    ownerId: string;
    creditLimit: number | null;
    available: number | null;
  };

/** "Available ≈" = credit limit − business balance; blank (null) without a limit. */
export function available(limit: number | null, balance: number): number | null {
  return limit == null ? null : sub(limit, balance);
}

/** The summary table's rows, in Setup's order (owner, card name). */
export function cardRows(cards: SetupCard[], summaries: Record<string, CardSummary>): CardRow[] {
  return cards.map(({ id, name, network, owner, display, statementDay, dueDay, active, ...c }) => {
    const s = summaries[id];
    const creditLimit = c.creditLimit == null ? null : parse(c.creditLimit);
    return {
      id,
      name,
      network,
      ownerId: c.ownerPersonId,
      owner,
      display,
      statementDay,
      dueDay,
      active,
      creditLimit,
      balance: s?.balance ?? 0,
      nextDue: s?.nextDue ?? null,
      overdue: s?.overdue ?? 0,
      status: s?.status ?? "clear",
      available: available(creditLimit, s?.balance ?? 0),
    };
  });
}

/** D-056: the Cards list's search: the owner, the card name or the Type, in any case (never the
 * card numbers, which sit behind the fingerprint). */
export function searchCards(rows: CardRow[], search: string): CardRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.owner, r.display, cardTitle(r.name, r.network)].some((t) => t.toLowerCase().includes(q)),
  );
}

export type OwnerGroup = {
  ownerId: string;
  owner: string;
  rows: CardRow[];
  /** All of the owner's cards ("1 of 6 cards" under a search). */
  of: number;
  /** The shown cards' balances added up (a card in credit reduces it). */
  balance: number;
};

/** D-056: the shown cards under their owners, in the given (Setup's) order. */
export function groupByOwner(shown: CardRow[], all: CardRow[]): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const r of shown) {
    const g = groups.get(r.ownerId) ?? {
      ownerId: r.ownerId,
      owner: r.owner,
      rows: [],
      of: all.filter((a) => a.ownerId === r.ownerId).length,
      balance: 0,
    };
    groups.set(r.ownerId, { ...g, rows: [...g.rows, r], balance: add(g.balance, r.balance) });
  }
  return [...groups.values()];
}

/** The detail's lists, newest first: bills by bill month, charges/credits by posting order. */
export function cardDetail(summary: CardSummary | undefined) {
  return {
    bills: [...(summary?.bills ?? [])].reverse(),
    moves: [...(summary?.moves ?? [])].reverse(),
    emiPlans: [...(summary?.emiPlans ?? [])].reverse(),
  };
}

/**
 * D-032: the statements a card page shows by default: the unpaid bills whose statement is out,
 * plus the next bill (the first whose statement is still to come). Paid bills and later EMI bills
 * wait behind "Show all". Keeps the given order.
 */
export function visibleBills<B extends Pick<Bill, "month" | "statementDate" | "remaining">>(
  bills: B[],
  today: string,
) {
  const next = [...bills]
    .filter((b) => b.statementDate > today)
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  const shown = bills.filter((b) => b === next || (b.remaining > 0 && b.statementDate <= today));
  return { shown, hiddenCount: bills.length - shown.length };
}

/**
 * The bill "Pay ৳remaining" belongs to: the oldest unpaid one. A card payment pays the oldest bill
 * first whatever its date (SRS §6.5), so a button on a later bill would pay the wrong one.
 */
export function billToPay<B extends Pick<Bill, "month" | "remaining">>(bills: B[]) {
  return (
    [...bills].filter((b) => b.remaining > 0).sort((a, b) => a.month.localeCompare(b.month))[0]
      ?.month ?? null
  );
}

/** An EMI charge's label: "EMI 5 × ৳4,347.33 · from Nov 2026" (the last part named if it
 * differs). */
export function emiLabel(plan: Pick<EmiPlan, "total" | "months">, firstBill: string) {
  return `EMI ${installments(plan.total, plan.months)} · from ${formatMonth(firstBill)}`;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(day: number) {
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10];
  return `${day}${suffix ?? "th"}`;
}

/** D-045: the bills whose statement date falls in a period, oldest first. */
export const billsIn = <B extends Pick<Bill, "statementDate">>(
  bills: B[],
  from: string,
  to: string,
) => bills.filter((b) => b.statementDate >= from && b.statementDate <= to);

export type EmiInstallment = { month: string; amount: number; billed: boolean };

/**
 * D-045: an EMI plan's installments, as the engine bills them: `splitEven` of the total from the
 * first bill month, one a month; billed once that bill's statement date is on or before `asOf`.
 * The ones not billed sum to the plan's `remaining`.
 */
export function emiSchedule(
  plan: Pick<EmiPlan, "total" | "months">,
  firstMonth: string,
  bills: Pick<Bill, "month" | "statementDate">[],
  asOf: string,
): EmiInstallment[] {
  return splitEven(plan.total, plan.months).map((amount, k) => {
    const month = addMonths(firstMonth, k);
    const bill = bills.find((b) => b.month === month);
    return { month, amount, billed: bill != null && bill.statementDate <= asOf };
  });
}

const REFUNDS = new Set(["purchase_return", "cashback"]);

/**
 * D-045: a card's moves in a period split by entry type: card payments, refunds & cashback, and
 * charges (everything else: purchases, fees, cash-outs, payments made by card, opening items).
 * Each is signed, so a reversal nets against its own kind (it keeps the type).
 * Charges − payments − refunds = the period's change in the balance.
 */
export function creditSplit(
  moves: Pick<CardMove, "entryId" | "date" | "amount">[],
  from: string,
  to: string,
  typeOf: (entryId: string) => string | undefined,
) {
  let [charges, payments, refunds] = [0, 0, 0];
  for (const m of moves) {
    if (m.date < from || m.date > to) continue;
    const type = typeOf(m.entryId) ?? "";
    if (type === "card_payment") payments = sub(payments, m.amount);
    else if (REFUNDS.has(type)) refunds = sub(refunds, m.amount);
    else charges = add(charges, m.amount);
  }
  return { charges, payments, refunds };
}
