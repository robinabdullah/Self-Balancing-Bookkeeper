import { describe, expect, it } from "vitest";
import { CARD_FEES } from "@mbl/domain/charts/profit";
import { EXPENSES } from "@mbl/domain/validation/fields";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import { monthProfit } from "@mbl/domain/engine/months";
import type { MoneyEntry } from "@mbl/domain/engine/post";
import { add } from "@mbl/domain/money";
import {
  costCategory,
  costEntries,
  costLabel,
  elsewhereLine,
  elsewhereNote,
  expenseReport,
  expenseSheets,
  noteOf,
  spendLine,
} from "@mbl/domain/expense-report";
import { expensesHref } from "@mbl/domain/href";
import { breakdownLines } from "@mbl/domain/months-view";
import { expensesPdf } from "../../apps/api/src/pdf/expenses";
import { pdfText } from "../../apps/api/src/pdf/report";
import { expensesText } from "@mbl/domain/whatsapp";
import { PARTNERS, expectBalanced } from "./invariant";

// CR-052 (D-075, D-080; UIDD §4.17): the Expense statement. Synthetic ids and figures only
// (D-014). Sep has every kind of cost and no tagged row (the tie-out month); Oct has a salary
// for Aug (tagged), a card-paid rent, a Card fee and the reversal of a Sep expense.
const [ARIF] = PARTNERS.map((p) => p.id);
const CARD = "card-1";
const TODAY = "2026-11-10";
const tk = (n: number) => n * 100;

let seq = 0;
const entries: StoredEntry[] = [];
function money(e: Omit<MoneyEntry, "table">): StoredEntry {
  seq += 1;
  const s: StoredEntry = {
    table: "money",
    ...e,
    id: `e-${seq}`,
    createdAt: `${e.date}T10:00:00.${String(seq).padStart(3, "0")}Z`,
  };
  entries.push(s);
  return s;
}
const expense = (date: string, category: string, amount: number, more: Partial<MoneyEntry> = {}) =>
  money({ type: "expense", date, category, amount: tk(amount), source: "cash", ...more });

money({ type: "capital_in", date: "2026-08-01", amount: tk(500_000), personId: ARIF });
// Sep: every category, a Card fee, two cash-outs (one with a fee), a reversal, capital out by card.
expense("2026-09-01", "salary", 30_000);
expense("2026-09-02", "delivery", 1_200);
expense("2026-09-03", "pos_qr", 300);
expense("2026-09-04", "rent", 20_000);
const internet = expense("2026-09-05", "internet", 1_500);
expense("2026-09-06", "other", 700);
const delivery = expense("2026-09-07", "delivery", 800);
money({
  type: "expense",
  date: "2026-09-08",
  category: "delivery",
  amount: tk(800),
  source: "cash",
  reversesId: delivery.id,
});
const sepFee = money({ type: "card_fee", date: "2026-09-10", amount: tk(1_150), cardId: CARD });
money({
  type: "card_cash_out",
  date: "2026-09-12",
  amount: tk(10_000),
  cardId: CARD,
  cardCharged: tk(10_000),
  cashReceived: tk(9_800),
});
money({
  type: "card_cash_out",
  date: "2026-09-13",
  amount: tk(5_000),
  cardId: CARD,
  cardCharged: tk(5_000),
  cashReceived: tk(5_000),
});
money({
  type: "capital_out",
  date: "2026-09-14",
  amount: tk(3_000),
  personId: ARIF,
  source: "card",
  cardId: CARD,
});
// Oct: a salary for Aug (tagged), rent by card, a Card fee, Sep's internet reversed.
const augSalary = expense("2026-10-02", "salary", 30_000, { forMonth: "2026-08" });
const cardRent = expense("2026-10-05", "rent", 20_000, { source: "card", cardId: CARD });
money({ type: "card_fee", date: "2026-10-10", amount: tk(1_500), cardId: CARD });
const reversal = expense("2026-10-12", "internet", 1_500, { reversesId: internet.id });

const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [{ id: CARD, statementDay: 5, dueDay: 20 }],
  billDates: [],
};
const books = computeBooks(data, TODAY);
const costs = costEntries(books.posted, data.entries);
const SEP = ["2026-09-01", "2026-09-30"] as const;
const OCT = ["2026-10-01", "2026-10-31"] as const;
const name = (id: string) => (id === CARD ? "Nadim · EBL Visa" : "—");
const notes = { [cardRent.id]: "Shop rent" };

describe("CR-052 Expense statement", () => {
  it("U-CR-052.1 the books balance", () => {
    expectBalanced(books.posted, TODAY);
  });

  it("U-CR-052.1 rows: each category, card fees and cash-out fees by date; reversals negative", () => {
    const r = expenseReport(costs, ...SEP);
    expect(r.rows.map((x) => [x.date, costLabel(x), x.amount])).toEqual([
      ["2026-09-01", "Salary", tk(30_000)],
      ["2026-09-02", "Delivery", tk(1_200)],
      ["2026-09-03", "POS/QR", tk(300)],
      ["2026-09-04", "Rent", tk(20_000)],
      ["2026-09-05", "Internet", tk(1_500)],
      ["2026-09-06", "Other", tk(700)],
      ["2026-09-07", "Delivery", tk(800)],
      ["2026-09-08", "Delivery", 0 - tk(800)],
      ["2026-09-10", "Card fee", tk(1_150)],
      ["2026-09-12", "Cash-out fee", tk(200)],
      // No row for the cash-out without a fee, nor for Capital out by card.
    ]);
    expect(r.rows.find((x) => x.amount < 0)?.reversal).toBe(true);
    expect(r.rows.some((x) => x.tagged)).toBe(false);
    expect(r.tagged).toBe(false);
    expect(r.rows.find((x) => x.id === sepFee.id)?.paidFrom).toBe(CARD);
    expect(r.total).toBe(tk(30_000 + 1_200 + 300 + 20_000 + 1_500 + 700 + 1_150 + 200));
  });

  it("U-CR-052.1 by category: largest first, Card fees last, with shares", () => {
    const r = expenseReport(costs, ...SEP);
    expect(r.byCategory.map((c) => [c.label, c.amount])).toEqual([
      ["Salary", tk(30_000)],
      ["Rent", tk(20_000)],
      ["Internet", tk(1_500)],
      ["Delivery", tk(1_200)],
      ["Other", tk(700)],
      ["POS/QR", tk(300)],
      ["Card fees", tk(1_350)],
    ]);
    expect(r.byCategory[0].share).toBe(54.5); // 30,000 / 55,050
    expect(r.byCategory.reduce((s, c) => s + c.amount, 0)).toBe(r.total);
  });

  it("U-CR-052.1 a tagged row, a card-paid expense, a reversal on its own date; Cash / Cards", () => {
    const r = expenseReport(costs, ...OCT);
    expect(r.rows.map((x) => [x.id, x.tagged, x.paidFrom, x.amount])).toEqual([
      [augSalary.id, true, "cash", tk(30_000)],
      [cardRent.id, false, CARD, tk(20_000)],
      [expect.any(String), false, CARD, tk(1_500)],
      [reversal.id, false, "cash", 0 - tk(1_500)],
    ]);
    expect(r.rows[0].forMonth).toBe("2026-08");
    expect(r.tagged).toBe(true);
    expect([r.total, r.cash, r.cards]).toEqual([tk(50_000), tk(28_500), tk(21_500)]);
    expect(spendLine(r)).toBe("4 entries · Cash ৳28,500 · Cards ৳21,500");
    expect(noteOf(r.rows[3], {})).toBe("Reversal");
  });

  it("U-CR-052.1 the filter: only that category, and the totals follow", () => {
    const r = expenseReport(costs, ...SEP, "delivery");
    expect(r.rows.map((x) => x.amount)).toEqual([tk(1_200), tk(800), 0 - tk(800)]);
    expect(r.byCategory).toEqual([
      { key: "delivery", label: "Delivery", amount: tk(1_200), share: 100 },
    ]);
    expect([r.total, r.cash, r.cards]).toEqual([tk(1_200), tk(1_200), 0]);
    expect(spendLine(r)).toBe("3 entries · Cash ৳1,200");
    expect(expenseReport(costs, ...SEP, CARD_FEES).total).toBe(tk(1_350));
    // D-080: Expenses only = every expense category, no card fees.
    const only = expenseReport(costs, ...SEP, EXPENSES);
    expect(only.rows.some((x) => x.category === CARD_FEES)).toBe(false);
    expect(only.total).toBe(tk(30_000 + 1_200 + 300 + 20_000 + 1_500 + 700));
    expect(only.byCategory.map((c) => c.label)).toEqual([
      "Salary",
      "Rent",
      "Internet",
      "Delivery",
      "Other",
      "POS/QR",
    ]);
    expect(costCategory(EXPENSES)).toBe(EXPENSES);
    expect(costCategory("rent")).toBe("rent");
    expect(costCategory(CARD_FEES)).toBe(CARD_FEES);
    expect(costCategory("card fee/interest")).toBeNull();
    expect(costCategory(undefined)).toBeNull();
  });

  it("U-CR-052.2 tie-out: a month with no tagged row equals the profit breakdown", () => {
    const r = expenseReport(costs, ...SEP);
    const p = monthProfit(books.posted, "2026-09", TODAY);
    expect(r.total).toBe(0 - (p.components.expense + p.components.fee));
    for (const c of r.byCategory) {
      const want = c.key === CARD_FEES ? p.components.fee : p.expenses[c.key];
      expect(c.amount).toBe(0 - want);
    }
    // D-080: the breakdown's Expenses and Card fees lines = the statement filtered to them.
    const lines = breakdownLines(p).filter((x) => x.cat);
    expect(lines.map((l) => l.cat)).toEqual([EXPENSES, CARD_FEES]);
    for (const l of lines) expect(expenseReport(costs, ...SEP, l.cat).total).toBe(0 - l.amount);
  });

  it("U-CR-052.2 a tagged row counts in its For month's profit, not in the statement's month", () => {
    const aug = monthProfit(books.posted, "2026-08", TODAY);
    expect(aug.expenses.salary).toBe(0 - tk(30_000));
    const r = expenseReport(costs, "2026-08-01", "2026-08-31");
    expect(r.rows).toEqual([]);
    // D-080: the note names it, and the total + the note = the month's Expenses line.
    expect(r.elsewhere?.rows.map((x) => [x.id, x.date])).toEqual([[augSalary.id, "2026-10-02"]]);
    expect(elsewhereNote(r)).toBe("Aug 2026's profit also counts ৳30,000 dated in another month:");
    expect(elsewhereLine(r.elsewhere!.rows[0])).toBe("Salary · 02 Oct 2026");
    const line = breakdownLines(aug).find((l) => l.cat === EXPENSES)!;
    expect(add(r.total, r.elsewhere!.total)).toBe(0 - line.amount);
    // Not for a range that isn't a whole month, nor for a filter it doesn't match.
    expect(expenseReport(costs, "2026-08-01", "2026-08-30").elsewhere).toBeNull();
    expect(expenseReport(costs, "2026-08-01", "2026-08-31", "rent").elsewhere).toBeNull();
    // Oct's own statement has no note: nothing dated elsewhere is for Oct.
    expect(expenseReport(costs, ...OCT).elsewhere).toBeNull();
  });

  it("U-CR-052.3 the WhatsApp text", () => {
    expect(expensesText({ report: expenseReport(costs, ...OCT), from: OCT[0], to: OCT[1] })).toBe(
      [
        "🧾 *Expenses — 01 Oct – 31 Oct 2026*",
        "4 entries · Cash ৳28,500 · Cards ৳21,500",
        "",
        "- Salary: ৳30,000 (60%)",
        "- Rent: ৳20,000 (40%)",
        "- Internet: -৳1,500 (-3%)",
        "- Card fees: ৳1,500 (3%)",
        "*Total: ৳50,000*",
      ].join("\n"),
    );
    const rent = expenseReport(costs, ...OCT, "rent");
    expect(expensesText({ report: rent, from: OCT[0], to: OCT[1] })).toBe(
      [
        "🧾 *Expenses · Rent — 01 Oct – 31 Oct 2026*",
        "1 entry · Cards ৳20,000",
        "",
        "- Rent: ৳20,000 (100%)",
        "*Total: ৳20,000*",
      ].join("\n"),
    );
    const none = expenseReport(costs, "2026-08-01", "2026-08-31");
    expect(expensesText({ report: none, from: "2026-08-01", to: "2026-08-31" })).toBe(
      [
        "🧾 *Expenses — 01 Aug – 31 Aug 2026*",
        "No expenses in this period.",
        "",
        "_Aug 2026's profit also counts ৳30,000 dated in another month:_",
        "- Salary · 02 Oct 2026: ৳30,000",
      ].join("\n"),
    );
  });

  it("U-CR-052.3 the PDF text and the Excel sheets, unfiltered and filtered", () => {
    const r = expenseReport(costs, ...OCT);
    const doc = expensesPdf({ report: r, from: OCT[0], to: OCT[1], name, notes });
    expect(doc.title).toBe("Expense statement");
    expect(doc.sections.map((s) => s.title)).toEqual([undefined, "By category", "Entries"]);
    expect(doc.sections[0].facts?.at(-1)).toEqual(["Total spent", "৳50,000"]);
    const entriesTable = doc.sections[2].table!;
    expect(entriesTable.rows[0][0]).toBe("02 Oct 2026 (for Aug 2026)");
    expect(entriesTable.rows[1]).toEqual([
      "05 Oct 2026",
      "Rent",
      "Nadim · EBL Visa",
      "Shop rent",
      "৳20,000",
    ]);
    expect(entriesTable.total).toEqual(["Total", "", "", "", "৳50,000"]);
    expect(doc.sections[2].note).toMatch(/For month/);
    expect(pdfText(doc)).toContain("Reversal");

    const rent = expensesPdf({
      report: expenseReport(costs, ...OCT, "rent"),
      from: OCT[0],
      to: OCT[1],
      name,
      notes,
    });
    expect(rent.title).toBe("Expense statement · Rent");
    expect(pdfText(rent)).not.toContain("Salary");

    const [byCat, list] = expenseSheets(r, name, notes);
    expect(byCat.name).toBe("By category");
    expect(byCat.rows.at(-1)).toEqual(["Total", tk(50_000), null]);
    expect(list.name).toBe("Entries");
    expect(list.rows[0]).toEqual(["2026-10-02", "Aug 2026", "Salary", "Cash", null, tk(30_000)]);
    expect(list.rows.at(-1)).toEqual([null, null, "Total", null, null, tk(50_000)]);
    const [rentCat] = expenseSheets(expenseReport(costs, ...OCT, "rent"), name, notes);
    expect(rentCat.rows.map((x) => x[0])).toEqual(["Rent", "Total"]);

    const empty = expensesPdf({
      report: expenseReport(costs, "2026-08-01", "2026-08-31"),
      from: "2026-08-01",
      to: "2026-08-31",
      name,
      notes,
    });
    expect(pdfText(empty)).toContain("No expenses in this period");
    expect(pdfText(empty)).toContain("Salary · 02 Oct 2026 · ৳30,000");
  });

  it("U-CR-052.4 one Expenses and one Card fees line with their filter; expensesHref gives the month", () => {
    const p = monthProfit(books.posted, "2026-09", TODAY);
    const lines = breakdownLines(p);
    expect(lines.map((l) => l.label)).toEqual([
      "Sale profit",
      "Customer returns",
      "Customer discounts",
      "Profit share",
      "Cashback",
      "Expenses",
      "Card fees",
      "Purchase returns",
    ]);
    expect(lines.find((l) => l.label === "Expenses")).toEqual({
      label: "Expenses",
      amount: 0 - tk(53_700),
      cat: EXPENSES,
    });
    expect(lines.find((l) => l.label === "Card fees")?.cat).toBe(CARD_FEES);
    expect(lines.find((l) => l.label === "Sale profit")?.cat).toBeUndefined();
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(p.total);
    expect(
      expensesText({ report: expenseReport(costs, ...SEP, EXPENSES), from: SEP[0], to: SEP[1] }),
    ).toMatch(/^🧾 \*Expenses only — 01 Sep – 30 Sep 2026\*/);
    expect(expensesHref("2026-09", "rent")).toBe(
      "/reports/expenses?from=2026-09-01&to=2026-09-30&cat=rent",
    );
    expect(expensesHref("2026-02", CARD_FEES)).toBe(
      "/reports/expenses?from=2026-02-01&to=2026-02-28&cat=card-fees",
    );
  });
});
