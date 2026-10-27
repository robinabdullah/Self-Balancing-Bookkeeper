import type { StatementRange } from "@/lib/accounts";
import { type ModelRow, modelSheet } from "@/lib/by-model";
import { type Cell, type Column, type Kind, type Sheet, positionRows } from "@/lib/export";
import { formatMonth } from "@/lib/dates";
import type { InvestorReport } from "@/lib/investor-report";
import { type MonthlyPack, topGroups } from "@/lib/monthly-pack";
import { NOT_ALLOCATED, cardState } from "@/lib/report-text";
import { salesSheets } from "@/lib/sales-report";
import { stockSheet } from "@/lib/stock-movement";

// D-045: the Excel files of the per-account reports and the Monthly pack: one sheet per section,
// from the same models as the screens (money stays poisha; the workbook writer converts it).

const cols = (...c: [string, Kind][]): Column[] => c.map(([header, kind]) => ({ header, kind }));
const sheet = (name: string, columns: Column[], rows: Cell[][]): Sheet => ({ name, columns, rows });

/** A statement as a sheet: Opening, the entries with their running balance, Closing. */
export function statementSheet(
  range: StatementRange,
  from: string,
  to: string,
  label: (entryId: string) => string,
  heads: [up: string, down: string],
): Sheet {
  return sheet(
    "Statement",
    cols(
      ["Date", "date"],
      ["Entry", "text"],
      [heads[0], "money"],
      [heads[1], "money"],
      ["Balance", "money"],
    ),
    [
      [from, "Opening balance", null, null, range.opening],
      ...range.lines.map((l) => [l.date, label(l.entryId), l.up, l.down, l.balance]),
      [null, "Totals", range.up, range.down, null],
      [to, "Closing balance", null, null, range.closing],
    ],
  );
}

export type CardSheetsInput = {
  bills: {
    month: string;
    statementDate: string;
    dueDate: string;
    amount: number;
    paid: number;
    remaining: number;
  }[];
  split: { charges: number; payments: number; refunds: number };
  emi: { label: string; schedule: { month: string; amount: number; billed: boolean }[] }[];
};

/** A card's statement: Statement · Bills · EMI schedule. */
export function cardSheets(statement: Sheet, x: CardSheetsInput): Sheet[] {
  return [
    {
      ...statement,
      rows: [
        ...statement.rows,
        [null, "Charges", x.split.charges, null, null],
        [null, "Card payments", null, x.split.payments, null],
        [null, "Refunds & cashback", null, x.split.refunds, null],
      ],
    },
    sheet(
      "Bills",
      cols(
        ["Bill month", "text"],
        ["Statement", "date"],
        ["Due", "date"],
        ["Amount", "money"],
        ["Paid", "money"],
        ["Left", "money"],
      ),
      x.bills.map((b) => [
        formatMonth(b.month),
        b.statementDate,
        b.dueDate,
        b.amount,
        b.paid,
        b.remaining,
      ]),
    ),
    sheet(
      "EMI schedule",
      cols(["Purchase", "text"], ["Month", "text"], ["Amount", "money"], ["Status", "text"]),
      x.emi.flatMap((p) =>
        p.schedule.map((s) => [
          p.label,
          formatMonth(s.month),
          s.amount,
          s.billed ? "Billed" : "To come",
        ]),
      ),
    ),
  ];
}

/** A customer's or supplier's statement with its By model sheets (only those not empty). */
export function modelSheets(
  statement: Sheet,
  tables: [string, ModelRow[]][],
  model: (id: string) => string,
): Sheet[] {
  return [
    statement,
    ...tables.filter(([, rows]) => rows.length > 0).map(([n, rows]) => modelSheet(n, rows, model)),
  ];
}

/** D-045: the Investor report: Capital · Cards · Allocations · Profit owed. */
export function investorSheets(r: InvestorReport): Sheet[] {
  const p = r.profit;
  return [
    sheet("Capital", cols(["Line", "text"], ["Amount", "money"]), [
      [`Capital on ${r.from}`, r.capital.opening],
      ...r.capital.groups.map((g) => [g.label, g.amount]),
      [`Capital on ${r.to}`, r.capital.closing],
    ]),
    sheet("Cards", cols(["Card", "text"], ["Balance", "money"], ["State", "text"]), [
      ...r.cards.map((c) => [c.display, c.balance, cardState(c)]),
      ["Card payments made", r.cardPayments, null],
    ]),
    sheet(
      "Allocations",
      cols(
        ["Month", "text"],
        ["Part", "text"],
        ["Basis", "money"],
        ["Rate %", "pct"],
        ["Amount", "money"],
      ),
      r.months.flatMap((m) =>
        m.rows == null
          ? [[formatMonth(m.month), NOT_ALLOCATED, null, null, null]]
          : m.rows.map((a) => [
              formatMonth(m.month),
              a.kind,
              a.basis ?? null,
              a.ratePct ?? null,
              a.amount,
            ]),
      ),
    ),
    sheet("Profit owed", cols(["Line", "text"], ["Date", "date"], ["Amount", "money"]), [
      ["Owed before the period", null, p.before],
      ["Allocated for the period", null, p.allocated],
      ["Allocated for later months", null, p.later],
      ["Opening & corrections", null, p.other],
      ...p.paid.map((l) => ["Paid", l.date, 0 - l.amount]),
      ...p.reinvested.map((l) => ["Reinvested", l.date, 0 - l.amount]),
      ["Profit owed now", null, p.owedNow],
    ]),
  ];
}

/** D-045: the Monthly pack, one sheet per section. */
export function packSheets(p: MonthlyPack, name: (id: string) => string): Sheet[] {
  const money2 = cols(["Line", "text"], ["Amount", "money"]);
  const dues = (rows: MonthlyPack["dues"]["customers"]) =>
    rows.map((r) => [name(r.id), r.start, r.end, r.change]);
  return [
    sheet(
      "Profit & loss",
      cols(["Line", "text"], ["This month", "money"], ["Last month", "money"]),
      [
        ...p.profit.rows.map((r) => [r.label, r.amount, r.last]),
        ["Month profit", p.profit.total, p.profit.last],
      ],
    ),
    sheet("Position", money2, [
      ...positionRows(p.position),
      ["Difference (0 = ✓)", p.position.difference],
    ]),
    sheet(
      "Allocations",
      cols(
        ["Person", "text"],
        ["Part", "text"],
        ["Basis", "money"],
        ["Rate %", "pct"],
        ["Amount", "money"],
      ),
      [
        ...(p.allocations.rows ?? []).map((a) => [
          name(a.personId),
          a.kind,
          a.basis ?? null,
          a.ratePct ?? null,
          a.amount,
        ]),
        ...p.allocations.owed.map((o) => [
          name(o.id),
          "Profit owed at month end",
          null,
          null,
          o.amount,
        ]),
      ],
    ),
    ...salesSheets({ ...p.sales, byCustomer: topGroups(p.sales.byCustomer) }, name).map((s) => ({
      ...s,
      name: `Sales ${s.name === "By customer" ? "top customers" : s.name}`,
    })),
    stockSheet(p.stock, name),
    sheet(
      "Dues",
      cols(["Name", "text"], ["Start", "money"], ["End", "money"], ["Change", "money"]),
      [
        ["Customers", null, null, null],
        ...dues(p.dues.customers),
        ["Suppliers", null, null, null],
        ...dues(p.dues.suppliers),
      ],
    ),
    sheet(
      "Card bills",
      cols(
        ["Card", "text"],
        ["Bill month", "text"],
        ["Due", "date"],
        ["Amount", "money"],
        ["Left", "money"],
        ["Overdue", "text"],
      ),
      [
        ...p.cards.bills.map((b) => [
          name(b.cardId),
          formatMonth(b.month),
          b.dueDate,
          b.amount,
          b.remaining,
          b.overdue ? "yes" : "",
        ]),
        ...p.cards.emi.map((e) => [name(e.cardId), "EMI left", null, null, e.remaining, ""]),
      ],
    ),
    sheet("Cash flow", cols(["Type", "text"], ["In", "money"], ["Out", "money"]), [
      ["Opening", p.cash.opening, null],
      ...p.cash.rows.map((r) => [r.label, r.in, r.out]),
      ["Closing", p.cash.closing, null],
    ]),
  ];
}
