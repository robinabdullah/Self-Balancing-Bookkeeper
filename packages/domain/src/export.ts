import { accountRows } from "./accounts";
import { STATUS, cardRows } from "./card-view";
import { type Breakdown, breakdown, positionSections } from "./dashboard";
import { monthOf } from "./dates";
import type { Books } from "./engine/index";
import type { StockLot } from "./engine/stock";
import { add, mul, parse } from "./money";
import { cardName, customerName } from "./setup";
import type { CardNetwork } from "./banks";
import { stockByModel } from "./stock-view";

// SRS §10 (task 6.4.1): the export's summary sheets, read off `computeBooks` through the same view
// helpers as the screens. Pure: money stays integer poisha here; the workbook writer converts it.
// Each sheet but Cash ends with a "Total" row (Cash is itself the totals).

/** How a column is written: money = poisha → a number with 2 decimals; date = "YYYY-MM-DD". */
export type Kind = "text" | "money" | "int" | "pct" | "date";
export type Cell = string | number | boolean | null;
export type Column = { header: string; kind: Kind };
export type Sheet = { name: string; columns: Column[]; rows: Cell[][] };

const col = (header: string, kind: Kind = "text"): Column => ({ header, kind });
const sum = (values: number[]) => values.reduce(add, 0);

type Person = {
  id: string;
  name: string;
  kind: "partner" | "investor";
  profitSharePct: string | null;
  note: string | null;
  active: boolean;
};
type Card = {
  id: string;
  name: string;
  network: CardNetwork;
  ownerPersonId: string;
  statementDay: number;
  dueDay: number;
  creditLimit: string | null;
  active: boolean;
};
type Customer = {
  id: string;
  shopName: string | null;
  proprietorName: string;
  phone: string | null;
  targetBalance: string | null;
  active: boolean;
};
type Party = { id: string; name: string; phone?: string | null; active: boolean };

export type SummaryInput = {
  books: Books;
  people: Person[];
  cards: Card[];
  customers: Customer[];
  suppliers: Party[];
  models: Party[];
  lots: (StockLot & { imeiNote: string | null })[];
  closes: { month: string; closeDate: string }[];
};

/**
 * The Books balance sheet's rows (D-064) for Excel: each section's title (no amount), its lines,
 * then its totals.
 */
export function positionRows(b: Breakdown): Cell[][] {
  return positionSections(b).flatMap((s) => [
    [s.title, null],
    ...[...s.lines, ...s.totals].map((l): Cell[] => [l.label, l.amount]),
  ]);
}

/** Both sides of the books-balance invariant (SRS §5), as the balance chip shows them. */
function cashSheet(books: Books): Sheet {
  const b = breakdown(books);
  return {
    name: "Cash",
    columns: [col("Line"), col("Amount", "money")],
    rows: [...positionRows(b), ["Difference (0 = balanced)", b.difference]],
  };
}

/** Lots with units left, by model (UIDD §4.7); value at cost. */
function stockSheet({ lots, models }: SummaryInput): Sheet {
  const names = Object.fromEntries(models.map((m) => [m.id, m.name]));
  const groups = stockByModel(lots, names, { all: false, search: "" });
  const rows = groups.flatMap((g) =>
    g.lots.map((l): Cell[] => [
      g.name,
      l.date,
      l.imeiNote,
      l.qty,
      l.remaining,
      l.unitCost,
      g.avg,
      mul(l.unitCost, l.remaining),
    ]),
  );
  return {
    name: "Stock",
    columns: [
      col("Model"),
      col("Purchased", "date"),
      col("IMEI / note"),
      col("Bought", "int"),
      col("Left", "int"),
      col("Unit cost", "money"),
      col("Model avg cost", "money"), // D-063: the model's avg cost of the units left
      col("Value", "money"),
    ],
    rows: [
      ...rows,
      [
        "Total",
        null,
        null,
        null,
        groups.reduce((n, g) => n + g.units, 0),
        null,
        null,
        sum(groups.map((g) => g.value)),
      ],
    ],
  };
}

function customersSheet({ books, customers }: SummaryInput): Sheet {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const rows = accountRows(
    customers.map((c) => ({ id: c.id, name: customerName(c), terms: [] })),
    books.customers,
  );
  return {
    name: "Customers",
    columns: [
      col("Customer"),
      col("Phone"),
      col("Due", "money"),
      col("Target", "money"),
      col("Last activity", "date"),
      col("Active"),
    ],
    rows: [
      ...rows.map((r): Cell[] => {
        const c = byId.get(r.id)!;
        const target = c.targetBalance == null ? null : parse(c.targetBalance);
        return [r.name, c.phone, r.balance, target, r.lastActivity, c.active];
      }),
      ["Total", null, sum(rows.map((r) => r.balance)), null, null, null],
    ],
  };
}

function suppliersSheet({ books, suppliers }: SummaryInput): Sheet {
  const byId = new Map(suppliers.map((s) => [s.id, s]));
  const rows = accountRows(
    suppliers.map((s) => ({ id: s.id, name: s.name, terms: [] })),
    books.suppliers,
  );
  return {
    name: "Suppliers",
    columns: [
      col("Supplier"),
      col("Phone"),
      col("We owe", "money"),
      col("Last activity", "date"),
      col("Active"),
    ],
    rows: [
      ...rows.map((r): Cell[] => {
        const s = byId.get(r.id)!;
        return [r.name, s.phone ?? null, r.balance, r.lastActivity, s.active];
      }),
      ["Total", null, sum(rows.map((r) => r.balance)), null, null],
    ],
  };
}

function cardsSheet({ books, cards, people }: SummaryInput): Sheet {
  const owner = new Map(people.map((p) => [p.id, p.name]));
  const rows = cardRows(
    cards.map((c) => {
      const ownerName = owner.get(c.ownerPersonId) ?? "";
      return { ...c, owner: ownerName, display: cardName(c.name, ownerName, c.network) };
    }),
    books.cards,
  );
  return {
    name: "Cards",
    columns: [
      col("Card"),
      col("Statement day", "int"),
      col("Due day", "int"),
      col("Credit limit", "money"),
      col("Balance", "money"),
      col("Available ≈", "money"),
      col("Next due date", "date"),
      col("Next due amount", "money"),
      col("Overdue", "money"),
      col("Status"),
      col("Active"),
    ],
    rows: [
      ...rows.map((r): Cell[] => [
        r.display,
        r.statementDay,
        r.dueDay,
        r.creditLimit,
        r.balance,
        r.available,
        r.nextDue?.date ?? null,
        r.nextDue?.amount ?? null,
        r.overdue,
        STATUS[r.status].label,
        r.active,
      ]),
      [
        "Total",
        null,
        null,
        null,
        sum(rows.map((r) => r.balance)),
        null,
        null,
        null,
        sum(rows.map((r) => r.overdue)),
        null,
        null,
      ],
    ],
  };
}

function peopleSheet({ books, people }: SummaryInput): Sheet {
  const diff = books.openingDifference.byPerson;
  const rows = people.map((p): Cell[] => [
    p.name,
    p.kind,
    p.profitSharePct == null ? null : Number(p.profitSharePct),
    books.capital[p.id] ?? 0,
    diff[p.id] ?? 0,
    books.profitOwed[p.id] ?? 0,
    p.note,
    p.active,
  ]);
  return {
    name: "People",
    columns: [
      col("Name"),
      col("Kind"),
      col("Profit share %", "pct"),
      col("Capital", "money"),
      col("Opening difference", "money"),
      col("Profit owed", "money"),
      col("Note"),
      col("Active"),
    ],
    rows: [
      ...rows,
      [
        "Total",
        null,
        null,
        sum(people.map((p) => books.capital[p.id] ?? 0)),
        sum(people.map((p) => diff[p.id] ?? 0)),
        sum(people.map((p) => books.profitOwed[p.id] ?? 0)),
        null,
        null,
      ],
    ],
  };
}

/** Every month with entries, oldest first; a closed month's profit = Σ its allocations. */
function monthsSheet({ books, closes }: SummaryInput): Sheet {
  const closedOn = new Map(closes.map((c) => [monthOf(c.month), c.closeDate]));
  return {
    name: "Months",
    columns: [col("Month"), col("Profit", "money"), col("Status"), col("Closed on", "date")],
    rows: [
      ...books.months.map((m): Cell[] => [
        m.month,
        m.profit,
        m.closed ? "Closed" : "Open",
        closedOn.get(m.month) ?? null,
      ]),
      ["Total", sum(books.months.map((m) => m.profit)), null, null],
    ],
  };
}

/** The seven summary sheets, in SRS §10's order. */
export function summarySheets(input: SummaryInput): Sheet[] {
  return [
    cashSheet(input.books),
    stockSheet(input),
    customersSheet(input),
    suppliersSheet(input),
    cardsSheet(input),
    peopleSheet(input),
    monthsSheet(input),
  ];
}
