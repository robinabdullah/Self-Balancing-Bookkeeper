import { describe, expect, it } from "vitest";
import { duesAround, statementRange, statementRowsOf } from "@mbl/domain/accounts";
import { dueStatements } from "@mbl/domain/engine/customers";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { periodRange, parseRange } from "@mbl/domain/journal-filter";
import { formatRange, formatSaved } from "@mbl/domain/dates";
import { expectBalanced, PARTNERS } from "./invariant";

// D-040: statements for a period, read off the books. Synthetic ids only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";
const CARD = "card-1";

let seq = 0;
const stored = (entry: Entry, time = "10:00:00"): StoredEntry => {
  seq += 1;
  return {
    ...entry,
    id: `e-${seq}`,
    createdAt: `${entry.date}T${time}.${String(seq).padStart(3, "0")}Z`,
  };
};
const money = (m: Omit<MoneyEntry, "table">) => stored({ table: "money", ...m });
const sale = (date: string, qty: number, unitPrice: number) =>
  stored({
    table: "sale",
    date,
    customerId: CUST,
    lines: [{ qty, unitPrice, unitCost: 1_000_000 }],
  });

const entries: StoredEntry[] = [
  money({ type: "capital_in", date: "2026-09-01", amount: 90_000_000, personId: ARIF }),
  stored({
    table: "purchase",
    date: "2026-09-02",
    source: "supplier_credit",
    supplierId: SUPP,
    lines: [{ qty: 20, unitCost: 1_000_000 }],
  }),
  stored({
    table: "purchase",
    date: "2026-09-03",
    source: "card",
    cardId: CARD,
    emiMonths: 3,
    lines: [{ qty: 3, unitCost: 1_000_000 }],
  }),
  sale("2026-09-10", 2, 1_200_000),
  money({ type: "customer_payment", date: "2026-09-20", amount: 1_000_000, customerId: CUST }),
  sale("2026-10-02", 3, 1_100_000),
  money({ type: "customer_payment", date: "2026-10-05", amount: 2_000_000, customerId: CUST }),
  money({
    type: "supplier_payment",
    date: "2026-10-06",
    amount: 5_000_000,
    supplierId: SUPP,
    source: "cash",
  }),
  money({ type: "card_payment", date: "2026-10-07", amount: 1_000_000, cardId: CARD }),
  money({ type: "capital_out", date: "2026-10-08", amount: 2_000_000, personId: ARIF }),
  sale("2026-11-01", 1, 1_300_000),
];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [{ id: CARD, statementDay: 5, dueDay: 20 }],
  billDates: [],
};
const asOf = "2026-11-02";
const books = computeBooks(data, asOf);
const ids: [Parameters<typeof statementRowsOf>[0], string][] = [
  ["customer", CUST],
  ["supplier", SUPP],
  ["person", ARIF],
  ["card", CARD],
];

describe("U-CR-020.1 statementRange ties out to the books", () => {
  it("the books balance", () => {
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, asOf);
  });

  for (const [kind, id] of ids) {
    it(`${kind}: opening + the period = closing = the balance at "to"`, () => {
      const rows = statementRowsOf(kind, id, books, asOf);
      const r = statementRange(rows, "2026-10-01", "2026-10-31");
      const sum = r.lines.reduce((n, l) => n + l.amount, 0);
      expect(r.opening + sum).toBe(r.closing);
      expect(r.up - r.down).toBe(sum);
      const atTo = computeBooks(data, "2026-10-31");
      const expected =
        kind === "customer"
          ? atTo.customers[id].balance
          : kind === "supplier"
            ? atTo.suppliers[id].balance
            : kind === "person"
              ? dueStatements(atTo.posted, "capital", "2026-10-31")[id].balance
              : atTo.cards[id].balance;
      expect(r.closing).toBe(expected);
      expect(r.lines.every((l) => l.date >= "2026-10-01" && l.date <= "2026-10-31")).toBe(true);
      expect(r.lines.at(-1)?.balance ?? r.opening).toBe(r.closing);
    });
  }

  it("the customer's numbers", () => {
    const r = statementRange(
      statementRowsOf("customer", CUST, books, asOf),
      "2026-10-01",
      "2026-10-31",
    );
    expect(r).toMatchObject({
      opening: 1_400_000,
      up: 3_300_000,
      down: 2_000_000,
      closing: 2_700_000,
    });
    expect(r.lines.map((l) => l.date)).toEqual(["2026-10-02", "2026-10-05"]);
  });

  it("an empty period keeps the balance", () => {
    const r = statementRange(
      statementRowsOf("customer", CUST, books, asOf),
      "2026-10-20",
      "2026-10-25",
    );
    expect(r).toMatchObject({ opening: 2_700_000, lines: [], closing: 2_700_000 });
  });
});

describe("U-CR-020.2 duesAround: the due before and after an entry", () => {
  const p = (id: string) => books.posted.find((e) => e.id === id)!;
  const oct = entries.find((e) => e.date === "2026-10-02")!;

  it("before / after, and today when newer entries exist", () => {
    expect(duesAround(books.posted, CUST, p(oct.id))).toEqual({
      previous: 1_400_000,
      now: 4_700_000,
      today: 4_000_000,
    });
    const last = entries.at(-1)!;
    expect(duesAround(books.posted, CUST, p(last.id))).toMatchObject({ today: null });
    expect(duesAround(books.posted, CUST, p(last.id)).now).toBe(books.customers[CUST].balance);
  });

  it("a sale and its Received-now payment (same saved time) are one pair", () => {
    const pair = [
      sale("2026-10-02", 1, 5_000_000),
      money({ type: "customer_payment", date: "2026-10-02", amount: 2_000_000, customerId: CUST }),
    ];
    pair[1].createdAt = pair[0].createdAt;
    // The payment sorts first on purpose: the pair never depends on line order.
    const b = computeBooks({ ...data, entries: [...entries, pair[1], pair[0]] }, asOf);
    const at = b.posted.find((e) => e.id === pair[0].id)!;
    const d = duesAround(b.posted, CUST, at);
    expect(d.now - d.previous).toBe(3_000_000);
    expect(d.today).toBe(b.customers[CUST].balance);
    expectBalanced(b.posted, asOf);
  });
});

describe("U-CR-020.3 periods, ranges and saved times", () => {
  it("periodRange: months, custom, all time", () => {
    expect(periodRange("this", "2026-10-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("last", "2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("2026-08", "2026-10-10")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodRange("custom", "2026-10-10", { from: "2026-10-03", to: "2026-10-09" })).toEqual({
      from: "2026-10-03",
      to: "2026-10-09",
    });
    expect(
      periodRange("custom", "2026-10-10", { from: "2026-10-09", to: "2026-10-03" }),
    ).toBeNull();
    expect(periodRange("", "2026-10-10")).toBeNull();
  });

  it("parseRange rejects bad dates", () => {
    expect(parseRange({ from: "2026-10-01", to: "2026-10-31" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(parseRange({ from: "2026-02-30", to: "2026-03-01" })).toBeNull();
    expect(parseRange({ from: "x", to: "2026-03-01" })).toBeNull();
    expect(parseRange({})).toBeNull();
  });

  it("formatRange", () => {
    expect(formatRange("2026-10-01", "2026-10-31")).toBe("01 Oct – 31 Oct 2026");
    expect(formatRange("2025-12-01", "2026-01-31")).toBe("01 Dec 2025 – 31 Jan 2026");
  });

  it("formatSaved: Dhaka 12-hour time; a back-dated entry shows its date only", () => {
    // 09:45 UTC = 3:45 PM in Dhaka (GMT+6), whatever the server's own zone (the VPS is GMT+8).
    expect(formatSaved("2026-10-10T09:45:00.000Z", "2026-10-10")).toBe("10 Oct 2026, 3:45 PM");
    // 19:10 UTC on the 9th is already 1:10 AM on the 10th in Dhaka.
    expect(formatSaved("2026-10-09T19:10:00.000Z", "2026-10-10")).toBe("10 Oct 2026, 1:10 AM");
    expect(formatSaved("2026-10-10T09:45:00.000Z", "2026-10-08")).toBe("08 Oct 2026");
  });
});
