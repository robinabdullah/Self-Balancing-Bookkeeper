import { extractText } from "unpdf";
import { describe, expect, it } from "vitest";
import { billProfit, duesAround } from "@mbl/domain/accounts";
import { type BooksData, type StoredEntry, computeBooks } from "@mbl/domain/engine/index";
import type { Entry, MoneyEntry } from "@mbl/domain/engine/post";
import { format } from "@mbl/domain/money";
import { invoicePdf, receiptPdf } from "../../apps/api/src/pdf/invoice";
import { renderDocPdf } from "../../apps/api/src/pdf/invoice-pdf";
import { pdfFileName, pdfFrame } from "../../apps/api/src/pdf/layout";
import { expectBalanced, PARTNERS } from "./invariant";

// CR-022 (D-042; UIDD §4.16): the invoice and the money receipt. Synthetic ids and figures only.
const [ARIF] = PARTNERS.map((p) => p.id);
const CUST = "cust-1";
const SUPP = "supp-1";
// A cost that appears nowhere else, so a leak is easy to spot.
const UNIT_COST = 987_654;
const PRICE_A = 1_750_000;
const PRICE_B = 1_980_000;

let seq = 0;
const stored = (entry: Entry, createdAt?: string): StoredEntry => {
  seq += 1;
  return { ...entry, id: `e-${seq}`, createdAt: createdAt ?? `${entry.date}T10:00:00.${seq}Z` };
};
const money = (m: Omit<MoneyEntry, "table">, createdAt?: string) =>
  stored({ table: "money", ...m }, createdAt);

// A sale saved with its "Received now" payment (same date and saved time), one line split over
// two lots, then a later payment.
const SAVED = "2026-10-10T09:45:00.000Z";
const sale = stored(
  {
    table: "sale",
    date: "2026-10-10",
    customerId: CUST,
    lines: [
      { qty: 1, unitPrice: PRICE_A, unitCost: UNIT_COST },
      { qty: 1, unitPrice: PRICE_A, unitCost: UNIT_COST },
      { qty: 1, unitPrice: PRICE_B, unitCost: UNIT_COST },
    ],
  },
  SAVED,
);
const paidNow = money(
  { type: "customer_payment", date: "2026-10-10", amount: 2_000_000, customerId: CUST },
  SAVED,
);
const payment = money({
  type: "customer_payment",
  date: "2026-10-12",
  amount: 5_000_000,
  customerId: CUST,
});
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
    lines: [{ qty: 3, unitPrice: 3_500_000, unitCost: UNIT_COST }],
  }),
  sale,
  paidNow,
  payment,
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
const posted = (e: StoredEntry) => books.posted.find((p) => p.id === e.id)!;
const dues = (e: StoredEntry) => duesAround(books.posted, CUST, posted(e));

const customer = { name: "Test Shop (Owner)", walkIn: false };
const items = [
  { model: "Phone A", qty: 1, unitPrice: PRICE_A },
  { model: "Phone A", qty: 1, unitPrice: PRICE_A },
  { model: "Phone B", qty: 1, unitPrice: PRICE_B },
];
const invoice = (over: Partial<Parameters<typeof invoicePdf>[0]> = {}) =>
  invoicePdf({
    number: "INV-0042",
    savedAt: "10 Oct 2026, 3:45 PM",
    customer,
    items,
    paidNow: 2_000_000,
    dues: dues(sale),
    reversedOn: null,
    ...over,
  });
const receipt = (over: Partial<Parameters<typeof receiptPdf>[0]> = {}) =>
  receiptPdf({
    number: "MR-0017",
    savedAt: "12 Oct 2026",
    customer,
    amount: 5_000_000,
    dues: dues(payment),
    reversedOn: null,
    bill: null,
    ...over,
  });
const billTotal = 2 * PRICE_A + PRICE_B;
const secret = [format(UNIT_COST), format(billProfit(posted(sale)))];
const value = (d: ReturnType<typeof invoice>, label: string) =>
  d.summary.find((l) => l.label === label)?.value;

describe("U-CR-022.1 the invoice and the money receipt", () => {
  it("the books balance", () => {
    expect(books.invariant.difference).toBe(0);
    expectBalanced(books.posted, asOf);
    expect(billProfit(posted(sale))).toBeGreaterThan(0);
  });

  it("invoice: the lines merged by model and price, the total and pieces", () => {
    const d = invoice();
    expect(d.title).toBe("Invoice INV-0042");
    expect(d.cancelled).toBeNull();
    expect(d.to).toBe("Bill to");
    expect(d.table!.heads).toEqual(["SL", "Model", "Qty", "Price", "Total"]);
    expect(d.table!.rows).toEqual([
      ["1", "Phone A", "2", format(PRICE_A), format(2 * PRICE_A)],
      ["2", "Phone B", "1", format(PRICE_B), format(PRICE_B)],
    ]);
    expect(d.table!.total).toEqual(["", "Total (3 pcs)", "", "", format(billTotal)]);
    expect(d.table!.words).toBe("Taka Fifty Four Thousand Eight Hundred Only");
  });

  it("invoice: Bill to with phone · address; PAID / PARTLY PAID / DUE from the Received now payment", () => {
    const c = { ...customer, phone: "01711000000", address: "Gulshan, Dhaka" };
    expect(invoice({ customer: c }).contact).toBe("01711000000 · Gulshan, Dhaka");
    expect(invoice().contact).toBeNull();
    expect(invoice().stamp).toEqual({ text: "PARTLY PAID", tone: "amber" });
    expect(invoice({ paidNow: billTotal }).stamp).toEqual({ text: "PAID", tone: "green" });
    expect(invoice({ paidNow: billTotal + 100 }).stamp).toEqual({ text: "PAID", tone: "green" });
    expect(invoice({ paidNow: 0 }).stamp).toEqual({ text: "DUE", tone: "red" });
    expect(invoice({ reversedOn: "2026-10-12" }).stamp).toBeNull();
    const walkIn = { name: "Walk-in", walkIn: true };
    expect(invoice({ customer: walkIn, paidNow: billTotal }).stamp!.text).toBe("PAID");
  });

  it("invoice: previous due + this bill − paid now = current due (tie-out); Due today follows", () => {
    const d = dues(sale);
    // The sale and its Received now payment count as one pair.
    expect(d.previous).toBe(10_500_000);
    expect(d.now).toBe(10_500_000 + billTotal - 2_000_000);
    expect(d.today).toBe(books.customers[CUST].balance);
    const doc = invoice();
    expect(doc.summary).toEqual([
      { label: "Previous due", value: format(10_500_000) },
      { label: "This bill", value: `+${format(billTotal)}` },
      { label: "Paid now", value: format(-2_000_000) },
      { label: "Current due", value: format(d.now), strong: true, rule: true },
      { label: "Due today", value: format(books.customers[CUST].balance) },
    ]);
  });

  it("invoice: no Paid now when nothing was paid; an advance reads Advance", () => {
    const d = invoice({ paidNow: 0, dues: { previous: -500_000, now: -100_000, today: null } });
    expect(d.summary.map((l) => l.label)).toEqual(["Previous advance", "This bill", "Advance"]);
    expect(value(d, "Advance")).toBe(format(100_000));
  });

  it("invoice: Walk-in has no dues, only Paid", () => {
    const walkIn = { name: "Walk-in", walkIn: true };
    expect(invoice({ customer: walkIn }).summary).toEqual([
      { label: "Paid", value: format(2_000_000) },
    ]);
    expect(invoice({ customer: walkIn, paidNow: 0 }).summary).toEqual([]);
  });

  it("invoice: a reversed sale prints CANCELLED, the lines as they were and no dues", () => {
    const d = invoice({ reversedOn: "2026-10-12" });
    expect(d.cancelled).toBe("Reversed on 12 Oct 2026");
    expect(d.table!.rows).toHaveLength(2);
    expect(d.summary).toEqual([]);
  });

  it("receipt: the amount in words and a ruled sum: Previous due − Received = Due now (tie-out)", () => {
    const d = receipt();
    expect(d.title).toBe("Money receipt MR-0017");
    expect(d.table).toBeNull();
    expect(d.amount).toEqual({ value: format(5_000_000), words: "Taka Fifty Thousand Only" });
    const before = dues(payment).previous;
    expect(d.summary).toEqual([
      { label: "Previous due", value: format(before) },
      { label: "Received", value: format(-5_000_000) },
      { label: "Due now", value: format(books.customers[CUST].balance), strong: true, rule: true },
    ]);
    expect(before - 5_000_000).toBe(books.customers[CUST].balance);
    expect(receipt({ amount: 5_050 }).amount!.words).toBe("Taka Fifty and Fifty Poisha Only");
  });

  it("receipt: a Received now payment shows its bill, so the sum adds up (tie-out)", () => {
    const d = dues(paidNow);
    const doc = receipt({
      amount: 2_000_000,
      dues: d,
      bill: { number: "INV-0042", amount: billTotal },
    });
    expect(doc.summary.slice(0, 4)).toEqual([
      { label: "Previous due", value: format(10_500_000) },
      { label: "Bill INV-0042", value: `+${format(billTotal)}` },
      { label: "Received", value: format(-2_000_000) },
      { label: "Due now", value: format(d.now), strong: true, rule: true },
    ]);
    expect(10_500_000 + billTotal - 2_000_000).toBe(d.now);
    expect(doc.summary[4]).toEqual({ label: "Due today", value: format(d.today!) });
    // The due before it was 10,500,000 + the bill; 2,000,000 of that is cleared.
    const pct = Math.floor((2_000_000 * 100) / (10_500_000 + billTotal));
    expect(doc.cleared).toEqual({ pct, label: `Cleared ${pct}% of the due` });
    expect(doc.stamp).toBeNull();
    expect(doc.to).toBe("Received with thanks from");
  });

  it("receipt: received with thanks from the customer, with phone · address when saved", () => {
    expect(receipt().contact).toBeNull();
    const c = { ...customer, phone: "01711000000", address: "Gulshan, Dhaka" };
    expect(receipt({ customer: c }).contact).toBe("01711000000 · Gulshan, Dhaka");
    expect(receipt({ customer: { ...customer, address: "Gulshan" } }).contact).toBe("Gulshan");
  });

  it("receipt: PAID IN FULL at ৳0, ADVANCE ৳X below 0, the bar only while some is left", () => {
    const full = receipt({ dues: { previous: 5_000_000, now: 0, today: null } });
    expect(full.stamp).toEqual({ text: "PAID IN FULL", tone: "green" });
    expect(full.cleared).toBeNull();
    const over = receipt({ dues: { previous: 4_000_000, now: -1_000_000, today: null } });
    expect(over.stamp).toEqual({ text: `ADVANCE ${format(1_000_000)}`, tone: "green" });
    expect(over.summary.at(-1)).toEqual({
      label: "Advance",
      value: format(1_000_000),
      strong: true,
      rule: true,
    });
    const part = receipt({ dues: { previous: 15_000_000, now: 10_000_000, today: null } });
    expect(part.cleared).toEqual({ pct: 33, label: "Cleared 33% of the due" });
    expect(part.stamp).toBeNull();
    // Already in advance before paying: no bar.
    const ahead = receipt({ dues: { previous: -100, now: -5_000_100, today: null } });
    expect(ahead.cleared).toBeNull();
    expect(ahead.stamp!.text).toBe(`ADVANCE ${format(5_000_100)}`);
  });

  it("receipt: Walk-in and a reversed payment have no dues, bar or stamp; reversed prints CANCELLED", () => {
    const walkIn = receipt({
      customer: { name: "Walk-in", walkIn: true },
      dues: { previous: 0, now: 0, today: null },
    });
    expect([walkIn.summary, walkIn.cleared, walkIn.stamp]).toEqual([[], null, null]);
    const d = receipt({ reversedOn: "2026-10-13", dues: { previous: 100, now: 0, today: null } });
    expect(d.cancelled).toBe("Reversed on 13 Oct 2026");
    expect([d.summary, d.cleared, d.stamp]).toEqual([[], null, null]);
    expect(receipt({ number: null }).title).toBe("Money receipt");
  });

  it("no cost or profit field, and no cost or profit amount, in either document", () => {
    for (const d of [invoice(), receipt()]) {
      const json = JSON.stringify(d);
      expect(json).not.toMatch(/cost|profit/i);
      for (const s of secret) expect(json).not.toContain(s);
    }
  });

  it("file names", () => {
    const shop = { name: "Demo Business Shop" };
    expect(pdfFileName(shop, "invoice", "INV-0042")).toBe(
      "demo-business-shop-invoice-inv-0042.pdf",
    );
    expect(pdfFileName(shop, "receipt", "MR-0017")).toBe("demo-business-shop-receipt-mr-0017.pdf");
  });

  it("renders PDFs whose text has the figures and no cost or profit", async () => {
    const frame = pdfFrame({ name: "Test Shop" } as never, "invoice", []);
    const read = async (d: ReturnType<typeof invoice>) => {
      const bytes = await renderDocPdf(frame, d);
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      return (await extractText(new Uint8Array(bytes), { mergePages: true })).text;
    };
    const d0 = invoice();
    const inv = await read(d0);
    expect(inv).toContain("Invoice INV-0042");
    expect(inv).toContain("Phone A");
    expect(inv).toContain(format(billTotal));
    expect(inv).toContain("Current due");
    expect(inv).toContain("Bill to");
    expect(inv).toContain("PARTLY PAID");
    expect(inv).toContain(d0.table!.words);
    expect(inv).toMatch(/Page 1 \/ 1/);
    for (const s of secret) expect(inv).not.toContain(s);

    expect(inv).toContain("Computer-generated, no signature required");

    const rec = await read(
      receipt({
        customer: { ...customer, phone: "01711000000" },
        dues: { previous: 15_000_000, now: 10_000_000, today: null },
      }),
    );
    expect(rec).toContain("Money receipt MR-0017");
    expect(rec).toContain("Received with thanks from");
    expect(rec).toContain("01711000000");
    expect(rec).toContain("Taka Fifty Thousand Only");
    expect(rec).toContain("Received");
    expect(rec).toContain("Cleared 33% of the due");
    expect(await read(receipt({ dues: { previous: 5_000_000, now: 0, today: null } }))).toContain(
      "PAID IN FULL",
    );

    const cancelled = await read(invoice({ reversedOn: "2026-10-12" }));
    expect(cancelled).toContain("CANCELLED");
    expect(cancelled).toContain("Reversed on 12 Oct 2026");
    expect(cancelled).not.toContain("Current due");
  }, 30_000);
});

// CR-029 (D-050; UIDD §4.16): the terms under "Terms & conditions", numbered, in a box; the footer
// line apart, below them.
describe("CR-029 the terms box", () => {
  const shop = {
    name: "Test Shop",
    invoiceTerms: "7-day replacement\nNo cash refund",
    receiptTerms: "Cheques are subject to clearance",
    footer: "Thank you for your business",
  } as never;
  const read = async (kind: "invoice" | "receipt", d: ReturnType<typeof invoice>, b = shop) =>
    (
      await extractText(new Uint8Array(await renderDocPdf(pdfFrame(b, kind, []), d)), {
        mergePages: true,
      })
    ).text;

  it("U-CR-029.2 the rendered PDFs read Terms & conditions, 1. …, 2. …, then the footer line", async () => {
    const inv = await read("invoice", invoice());
    expect(inv).toMatch(
      /Terms & conditions\s*1\.\s*7-day replacement\s*2\.\s*No cash refund\s*Thank you for your business/,
    );
    expect(inv).not.toContain("Cheques");

    const rec = await read("receipt", receipt());
    expect(rec).toMatch(
      /Terms & conditions\s*1\.\s*Cheques are subject to clearance\s*Thank you for your business/,
    );
    expect(rec).not.toContain("7-day replacement");

    // No terms: no box or heading; the footer line still prints. Neither: nothing.
    const footerOnly = await read("invoice", invoice(), {
      name: "Test Shop",
      footer: "Thanks",
    } as never);
    expect(footerOnly).not.toContain("Terms & conditions");
    expect(footerOnly).toContain("Thanks");
    const bare = await read("invoice", invoice(), { name: "Test Shop" } as never);
    expect(bare).not.toContain("Terms & conditions");
    expect(bare).not.toContain("Thank");
  }, 30_000);
});
