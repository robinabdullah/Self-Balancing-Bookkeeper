import { describe, expect, it } from "vitest";
import { cashBook } from "@mbl/domain/cash-book";
import { addDays } from "@mbl/domain/dates";
import { cashBookText } from "@mbl/domain/whatsapp";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { add } from "@mbl/domain/money";
import { expectBalanced, PARTNERS } from "./invariant";

// CR-023 (D-043; UIDD §4.17): the Cash book. Synthetic ids and figures only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";

let seq = 0;
const stored = (entry: Entry, time = "10:00:00"): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T${time}.${seq}Z` };
};
const money = (m: Omit<MoneyEntry, "table">, time?: string) =>
  stored({ table: "money", ...m }, time);

const capital = money({
  type: "capital_in",
  date: "2026-10-01",
  amount: 50_000_000,
  personId: ARIF,
});
const purchase = stored({
  table: "purchase",
  date: "2026-10-02",
  source: "cash",
  lines: [{ qty: 4, unitCost: 2_000_000 }],
});
// A sale moves no cash; its "Received now" payment does (same date and time).
const sale = stored({
  table: "sale",
  date: "2026-10-04",
  customerId: CUST,
  lines: [{ qty: 1, unitPrice: 2_500_000, unitCost: 2_000_000 }],
});
// Saved later in the day but listed first in the array: the order saved wins.
const expense = money(
  { type: "expense", date: "2026-10-04", amount: 150_000, source: "cash", category: "rent" },
  "18:00:00",
);
const payment = money(
  { type: "customer_payment", date: "2026-10-04", amount: 1_000_000, customerId: CUST },
  "11:00:00",
);
const supplierCredit = stored({
  table: "purchase",
  date: "2026-10-05",
  source: "supplier_credit",
  supplierId: SUPP,
  lines: [{ qty: 1, unitCost: 1_000_000 }],
});
// The payment reversed two days later: on the Out side, on its own date.
const reversal = money({
  type: "customer_payment",
  date: "2026-10-06",
  amount: 1_000_000,
  customerId: CUST,
  reversesId: payment.id,
});
const later = money({ type: "capital_in", date: "2026-10-09", amount: 100_000, personId: ARIF });

const entries = [capital, purchase, sale, expense, payment, supplierCredit, reversal, later];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [],
  billDates: [],
};
const asOf = "2026-10-10";
const books = computeBooks(data, asOf);

describe("U-CR-023.1 cashBook: opening, each cash move, closing", () => {
  it("the books balance", () => {
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, asOf);
  });

  it("closing cash on any day = the books' cash on that day", () => {
    for (const day of ["2026-10-01", "2026-10-03", "2026-10-04", "2026-10-06", "2026-10-10"]) {
      const book = cashBook(books.posted, day, day);
      expect(book.closing).toBe(computeBooks(data, day).cash);
      expect(book.opening).toBe(computeBooks(data, addDays(day, -1)).cash);
    }
  });

  it("a range: opening + every row = closing, and each day ties to its own balance", () => {
    const book = cashBook(books.posted, "2026-10-01", "2026-10-31");
    expect(book.opening).toBe(0);
    const moved = book.days.flatMap((d) => d.rows).reduce((s, r) => add(s, r.amount), 0);
    expect(add(book.opening, moved)).toBe(book.closing);
    expect(book.closing).toBe(computeBooks(data, "2026-10-31").cash);
    for (const d of book.days) {
      expect(d.closing).toBe(computeBooks(data, d.date).cash);
      expect(d.rows.at(-1)!.balance).toBe(d.closing);
    }
  });

  it("only days with cash moves; a sale shows nothing, its payment does", () => {
    const book = cashBook(books.posted, "2026-10-01", "2026-10-31");
    expect(book.days.map((d) => d.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-04",
      "2026-10-06",
      "2026-10-09",
    ]);
    const ids = book.days.flatMap((d) => d.rows.map((r) => r.id));
    expect(ids).not.toContain(sale.id);
    expect(ids).not.toContain(supplierCredit.id);
  });

  it("within a day, the order saved; In is +, Out is −", () => {
    const [day] = cashBook(books.posted, "2026-10-04", "2026-10-04").days;
    expect(day.rows.map((r) => [r.id, r.amount])).toEqual([
      [payment.id, 1_000_000],
      [expense.id, -150_000],
    ]);
  });

  it("a reversal sits on the opposite side, on its own date", () => {
    const [day] = cashBook(books.posted, "2026-10-06", "2026-10-06").days;
    expect(day.rows).toEqual([expect.objectContaining({ id: reversal.id, amount: -1_000_000 })]);
  });

  it("a quiet day: no rows, opening = closing; entries after `to` don't count", () => {
    const book = cashBook(books.posted, "2026-10-07", "2026-10-07");
    expect(book.days).toEqual([]);
    expect(book.opening).toBe(book.closing);
    expect(book.closing).toBe(computeBooks(data, "2026-10-07").cash);
  });
});

describe("U-CR-023.3 cashBookText: the day book message", () => {
  const label = (id: string) => (id === payment.id ? "Payment in Karim" : "Expense");

  it("one day: the v1.1 plan's sample layout", () => {
    const book = cashBook(books.posted, "2026-10-04", "2026-10-04");
    expect(cashBookText({ book, label })).toBe(
      [
        "💵 *Cash book — 04 Oct 2026*",
        "Opening: ৳4,20,000",
        "- In: Payment in Karim ৳10,000",
        "- Out: Expense ৳1,500",
        "*Closing: ৳4,28,500*",
      ].join("\n"),
    );
  });

  it("a range: one block per day; a quiet range says so", () => {
    const text = cashBookText({ book: cashBook(books.posted, "2026-10-04", "2026-10-06"), label });
    expect(text).toContain("💵 *Cash book — 04 Oct – 06 Oct 2026*");
    expect(text).toContain("_04 Oct_\n- In: Payment in Karim ৳10,000");
    expect(text).toContain("_06 Oct_\n- Out: Expense ৳10,000");
    expect(text.split("\n").at(-1)).toBe("*Closing: ৳4,18,500*");
    const quiet = cashBookText({ book: cashBook(books.posted, "2026-10-07", "2026-10-08"), label });
    expect(quiet).toContain("No cash in or out.");
  });
});
