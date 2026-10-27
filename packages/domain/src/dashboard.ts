// The Home screen's lists and the balance chip's breakdown (UIDD §3, §4.2), read off the engine's
// `Books`. Pure: no amount is computed here that the engine doesn't already hold, only picked,
// summed across cards/people and ordered. Integer poisha.
import { daysBetween } from "./dates";
import type { Books } from "./engine/index";
import { aboveTarget } from "./engine/customers";
import { add } from "./money";

const total = (amounts: number[]) => amounts.reduce(add, 0);

/** One unpaid card bill: `daysLeft` < 0 = overdue by that many days. */
export type CardAlert = { cardId: string; dueDate: string; amount: number; daysLeft: number };

/**
 * UIDD §4.2 "Card alerts" (D-032): one row per card, for its earliest unpaid bill (so a card's
 * future EMI bills don't fill the list), by due date (overdue first), the first `n`.
 */
export function cardAlerts(cards: Books["cards"], today: string, n = 5): CardAlert[] {
  return Object.entries(cards)
    .flatMap(([cardId, card]) => {
      const bill = card.bills
        .filter((b) => b.remaining > 0)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      if (!bill) return [];
      return [
        {
          cardId,
          dueDate: bill.dueDate,
          amount: bill.remaining,
          daysLeft: daysBetween(today, bill.dueDate),
        },
      ];
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.cardId.localeCompare(b.cardId))
    .slice(0, n);
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
/** A card alert's "3 days left", "today" or "2 days overdue" (Home, Charts' Bills due next). */
export const daysLeft = (n: number) =>
  n === 0 ? "today" : n > 0 ? `${days(n)} left` : `${days(-n)} overdue`;

/** Card dues across every card: overdue (red) and due within 7 days (amber). */
export function cardDues(cards: Books["cards"]) {
  const all = Object.values(cards);
  return {
    overdue: total(all.map((c) => c.overdue)),
    week: total(all.map((c) => c.dueWithin7Days)),
  };
}

export type TopDue = { customerId: string; balance: number; aboveTarget: number | null };

/** UIDD §4.2 "Top customer dues": who owes most (credits left out), with "above target". */
export function topDues(
  customers: Books["customers"],
  targets: Record<string, number | null>,
  n = 5,
): TopDue[] {
  return Object.entries(customers)
    .filter(([, s]) => s.balance > 0)
    .sort(([a, x], [b, y]) => y.balance - x.balance || a.localeCompare(b))
    .slice(0, n)
    .map(([customerId, s]) => ({
      customerId,
      balance: s.balance,
      aboveTarget: aboveTarget(s.balance, targets[customerId]),
    }));
}

export type BreakdownLine = { label: string; amount: number };

/**
 * The Books balance sheet (UIDD §3, D-064): both sides of the invariant (SRS §5), signed as they
 * count. What we have sums to `businessAssets`; what we owe (negative) to `oweTotal`; the two make
 * `netAssets` (net worth). The equity lines sum to `equity`; `difference` = 0 is ✓.
 */
export function breakdown(books: Books) {
  const haveLines: BreakdownLine[] = [
    { label: "Cash", amount: books.cash },
    { label: "Stock at cost", amount: books.stock },
    { label: "Customers owe", amount: books.customerDues },
  ];
  const oweLines: BreakdownLine[] = [
    { label: "Card balances", amount: 0 - books.cardBalances },
    { label: "We owe suppliers", amount: 0 - books.supplierDues },
  ];
  const equityLines: BreakdownLine[] = [
    { label: "Capital", amount: total(Object.values(books.capital)) },
    { label: "Opening difference", amount: books.openingDifference.total },
    { label: "Profit owed", amount: total(Object.values(books.profitOwed)) },
    { label: "Undistributed profit", amount: books.undistributed },
  ];
  return {
    haveLines,
    businessAssets: total(haveLines.map((l) => l.amount)),
    oweLines,
    oweTotal: total(oweLines.map((l) => l.amount)),
    equityLines,
    ...books.invariant,
  };
}

export type Breakdown = ReturnType<typeof breakdown>;

export type PositionSection = { title: string; lines: BreakdownLine[]; totals: BreakdownLine[] };

/** D-064: the sheet's sections, in order, as the chip, the pack and the export list them. */
export function positionSections(b: Breakdown): PositionSection[] {
  return [
    {
      title: "What we have",
      lines: b.haveLines,
      totals: [{ label: "Business assets", amount: b.businessAssets }],
    },
    {
      title: "What we owe",
      lines: b.oweLines,
      totals: [
        { label: "Total we owe", amount: b.oweTotal },
        { label: "Net worth", amount: b.netAssets },
      ],
    },
    { title: "Whose it is", lines: b.equityLines, totals: [{ label: "Total", amount: b.equity }] },
  ];
}
