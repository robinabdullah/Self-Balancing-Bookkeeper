import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import { statementRange, statementRowsOf } from "@mbl/domain/accounts";
import { billProfit } from "@mbl/domain/accounts";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { add, format } from "@mbl/domain/money";
import { pdfFileName, pdfFrame } from "@/pdf/layout";
import { closingLine, statementPdf } from "@/pdf/statement";
import { renderStatementPdf } from "@/pdf/statement-pdf";
import { expectBalanced, PARTNERS } from "./invariant";

// CR-021 (D-041; UIDD §4.16): the due statement PDF. Synthetic ids and figures only (D-014).
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";
// A cost and a sale price that appear nowhere else, so a leak is easy to spot.
const UNIT_COST = 987_654;
const UNIT_PRICE = 1_234_500;

let seq = 0;
const stored = (entry: Entry): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: `${entry.date}T10:00:00.${seq}Z` };
};
const money = (m: Omit<MoneyEntry, "table">) => stored({ table: "money", ...m });

const entries: StoredEntry[] = [
  money({ type: "capital_in", date: "2026-09-01", amount: 90_000_000, personId: ARIF }),
  stored({
    table: "purchase",
    date: "2026-09-02",
    source: "supplier_credit",
    supplierId: SUPP,
    lines: [{ qty: 10, unitCost: UNIT_COST }],
  }),
  stored({
    table: "sale",
    date: "2026-09-10",
    customerId: CUST,
    lines: [{ qty: 1, unitPrice: UNIT_PRICE, unitCost: UNIT_COST }],
  }),
  stored({
    table: "sale",
    date: "2026-10-02",
    customerId: CUST,
    lines: [{ qty: 2, unitPrice: UNIT_PRICE, unitCost: UNIT_COST }],
  }),
  money({ type: "customer_payment", date: "2026-10-05", amount: 1_000_000, customerId: CUST }),
  money({
    type: "supplier_payment",
    date: "2026-10-06",
    amount: 2_000_000,
    supplierId: SUPP,
    source: "cash",
  }),
];
const data: BooksData = {
  entries,
  partners: PARTNERS,
  allocations: [],
  closed: [],
  cards: [],
  billDates: [],
};
const asOf = "2026-10-31";
const books = computeBooks(data, asOf);
const [from, to] = ["2026-10-01", "2026-10-31"];
const range = (kind: "customer" | "supplier", id: string) =>
  statementRange(statementRowsOf(kind, id, books, asOf), from, to);
const doc = (kind: "customer" | "supplier", id: string) =>
  statementPdf({ kind, name: "Test Shop", from, to, range: range(kind, id), label: () => "Sale" });

const saleIds = entries.filter((e) => e.table === "sale").map((e) => e.id);
const profits = saleIds.map((id) => billProfit(books.posted.find((p) => p.id === id)));
const costs = [UNIT_COST, UNIT_COST * 2];
const secret = [...profits, ...costs].map(format);

describe("U-CR-021.1 the due statement PDF", () => {
  it("the books balance", () => {
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, asOf);
    expect(profits.every((p) => p > 0)).toBe(true);
  });

  it("customer: opening + the period = closing = the due at 'to' (tie-out)", () => {
    const r = range("customer", CUST);
    expect(add(r.opening, add(r.up, 0 - r.down))).toBe(r.closing);
    expect(r.closing).toBe(books.customers[CUST].balance);
    const d = doc("customer", CUST);
    expect(d.rows[0].cells).toEqual(["01 Oct 2026", "Opening balance", "", "", format(UNIT_PRICE)]);
    expect(d.rows.at(-2)!.cells).toEqual(["", "Totals", format(r.up), format(r.down), ""]);
    expect(d.rows.at(-1)!.cells[4]).toBe(format(r.closing));
    expect(d.closing).toBe(`Please pay ${format(r.closing)}`);
  });

  it("supplier: we owe more is a credit; the closing line speaks to the supplier", () => {
    const r = range("supplier", SUPP);
    expect(r.closing).toBe(books.suppliers[SUPP].balance);
    const d = doc("supplier", SUPP);
    // A payment lowers what we owe: the Debit column.
    expect(d.rows[1].cells.slice(2, 4)).toEqual([format(2_000_000), ""]);
    expect(d.closing).toBe(`Balance due to you: ${format(r.closing)}`);
  });

  it("closing line wording", () => {
    expect(closingLine("customer", 5000)).toBe("Please pay ৳50");
    expect(closingLine("customer", -5000)).toBe("Advance ৳50");
    expect(closingLine("customer", 0)).toBe("No due");
    expect(closingLine("supplier", 5000)).toBe("Balance due to you: ৳50");
    expect(closingLine("supplier", -5000)).toBe("Advance paid ৳50");
    expect(closingLine("supplier", 0)).toBe("No due");
  });

  it("no cost or profit field, and no cost or profit amount, in the customer document", () => {
    const d = doc("customer", CUST);
    const json = JSON.stringify(d);
    expect(json).not.toMatch(/cost|profit/i);
    for (const s of secret) expect(json).not.toContain(s);
  });

  it("the header, terms, How to pay and file name", () => {
    const frame = pdfFrame(
      {
        name: "Test Shop",
        address: "1 Road, Dhaka",
        phones: "01700000000",
        email: null,
        tradeLicence: "TL-1",
        tin: null,
        bin: "BIN-9",
        invoiceTerms: "Goods once sold are not returned.",
        receiptTerms: null,
        statementTerms: "Please report any difference within 7 days.",
        footer: null,
        logo: "data:image/webp;base64,AAAA",
      },
      "statement",
      [
        {
          bankName: "Test Bank",
          branch: null,
          accountName: "Test Shop",
          accountNumber: "1234567890",
          routingNumber: null,
        },
      ],
      new Date("2026-10-11T09:45:00Z"),
    );
    expect(frame.lines).toEqual([
      "1 Road, Dhaka",
      "Phone: 01700000000",
      "Trade licence: TL-1 · BIN: BIN-9",
    ]);
    expect(frame.logo).toBeNull();
    // D-049: the statement's own terms, never the invoice terms.
    expect(frame.terms).toEqual(["Please report any difference within 7 days."]);
    expect(frame.generated).toBe("Generated 11 Oct 2026, 3:45 PM");
    expect(frame.howToPay).toEqual([
      [
        ["Bank", "Test Bank"],
        ["Account name", "Test Shop"],
        ["Account number", "1234567890"],
      ],
    ]);
    expect(
      pdfFileName(
        { name: "Demo Business Shop" },
        "statement",
        "Rahman Telecom (Karim)",
        from,
        "to",
        to,
      ),
    ).toBe("demo-business-shop-statement-rahman-telecom-karim-2026-10-01-to-2026-10-31.pdf");
  });

  it("renders a PDF whose text has the figures and no cost or profit", async () => {
    const d = doc("customer", CUST);
    const bytes = await renderStatementPdf(
      pdfFrame({ name: "Test Shop" } as never, "statement", []),
      d,
    );
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true });
    expect(text).toContain("Statement of account");
    expect(text).toContain(d.closing);
    expect(text).toMatch(/Page 1 \/ 1/);
    for (const s of secret) expect(text).not.toContain(s);
  }, 30_000);
});
