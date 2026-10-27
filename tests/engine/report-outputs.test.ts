import { describe, expect, it } from "vitest";
import { statementRange, statementRowsOf } from "@/lib/accounts";
import { modelSheet, modelTotal, piecesAt, purchasesByModel } from "@/lib/by-model";
import { billsIn, creditSplit, emiSchedule } from "@/lib/card-view";
import type { Cell, Sheet } from "@/lib/export";
import { computeBooks } from "@/lib/engine/index";
import { dayBefore, investorReport } from "@/lib/investor-report";
import { format } from "@/lib/money";
import { monthlyPack, packDates } from "@/lib/monthly-pack";
import { cardSheets, investorSheets, packSheets, statementSheet } from "@/lib/report-sheets";
import { cardExtrasText, investorText, modelText, packText } from "@/lib/report-text";
import { salesReport, salesSheets } from "@/lib/sales-report";
import { stockTotal } from "@/lib/stock-movement";
import { salesText, statementText } from "@/lib/whatsapp";
import { cardPdf, investorPdf, modelSection } from "@/pdf/account-reports";
import { packPdf } from "@/pdf/pack";
import { pdfText } from "@/pdf/report";
import { salesPdf } from "@/pdf/sales";
import {
  CARD,
  ARIF,
  SUPP,
  NADIM,
  TODAY,
  bought,
  books,
  data,
  person,
  sentBack,
  setupCards,
  snapshots,
  stock,
  typeOf,
} from "./report-fixture";

// CR-025 (D-045: one model per report): each report's message, PDF and Excel say the same figures
// as its model (so as its screen). Synthetic data.

const name = (id: string) => ({ [CARD]: "Nadim · EBL Visa" })[id] ?? id;
const row = (s: Sheet, label: string) => s.rows.find((r) => r[0] === label) as Cell[];
const sheet = (sheets: Sheet[], n: string) => sheets.find((s) => s.name === n)!;

describe("U-CR-025.5 the message, PDF and Excel read the report's model", () => {
  const investor = (id: string) =>
    investorReport({
      person: person(id),
      books,
      atEnd: computeBooks(data, "2026-10-31"),
      beforeFrom: computeBooks(data, dayBefore("2026-09-01")),
      allocations: data.allocations,
      closed: data.closed,
      cards: setupCards,
      from: "2026-09-01",
      to: "2026-10-31",
      today: TODAY,
      typeOf,
    });

  it("the Investor report", () => {
    const r = investor(NADIM);
    const key = [r.capital.closing, r.profit.owedNow, r.cardPayments, r.profit.before].map(format);
    const text = investorText(r, "Test Shop");
    const pdf = pdfText(investorPdf(r));
    for (const k of key) {
      expect(text).toContain(k);
      expect(pdf).toContain(k);
    }
    expect(text).toContain("*Investor report — Nadim*");
    expect(text).toContain("Oct 2026: not allocated yet (month open)");
    expect(text).toContain("Nadim · EBL Visa: due");
    const sheets = investorSheets(r);
    expect(row(sheet(sheets, "Capital"), "Capital on 2026-10-31")[1]).toBe(r.capital.closing);
    expect(row(sheet(sheets, "Profit owed"), "Profit owed now")[2]).toBe(r.profit.owedNow);
    expect(row(sheet(sheets, "Cards"), "Card payments made")[1]).toBe(r.cardPayments);
    // A partner's report is titled so and carries the opening difference.
    expect(investorText(investor(ARIF))).toContain("*Partner report — Arif*");
    expect(pdfText(investorPdf(investor(ARIF)))).toContain("Opening difference");
  });

  it("the card statement: bills, credit split and EMI in the PDF, text and sheets", () => {
    const end = "2026-10-31";
    const s = computeBooks(data, end).cards[CARD];
    const first = new Map(s.moves.map((m) => [m.entryId, m.billMonth]));
    const x = {
      end,
      facts: {
        balance: s.balance,
        nextDue: s.nextDue,
        overdue: s.overdue,
        remainingEmi: s.remainingEmi,
      },
      bills: billsIn(s.bills, "2026-10-01", end),
      split: creditSplit(s.moves, "2026-10-01", end, typeOf),
      emi: s.emiPlans.map((p) => ({
        label: "Model B × 3",
        total: p.total,
        months: p.months,
        schedule: emiSchedule(p, first.get(p.entryId)!, s.bills, end),
      })),
    };
    const range = statementRange(statementRowsOf("card", CARD, books, TODAY), "2026-10-01", end);
    const label = () => "Entry";
    const doc = pdfText(
      cardPdf({ ...x, name: name(CARD), from: "2026-10-01", to: end, range, label }),
    );
    const text = statementText({
      kind: "card",
      name: name(CARD),
      from: "2026-10-01",
      to: end,
      range,
      label,
      extra: cardExtrasText(x),
    });
    for (const k of [
      x.bills[0].remaining,
      x.split.payments,
      x.split.refunds,
      s.remainingEmi,
      range.closing,
    ].map(format)) {
      expect(doc).toContain(k);
    }
    for (const k of [x.bills[0].remaining, x.split.payments].map(format)) expect(text).toContain(k);
    expect(text).toContain("📆 *EMI to come*");
    const sheets = cardSheets(
      statementSheet(range, "2026-10-01", end, label, ["Charge", "Credit"]),
      x,
    );
    expect(sheet(sheets, "Bills").rows[0][5]).toBe(x.bills[0].remaining);
    expect(sheet(sheets, "EMI schedule").rows).toHaveLength(3);
    const payments = sheet(sheets, "Statement").rows.find((r) => r[1] === "Card payments")!;
    expect(payments[3]).toBe(x.split.payments);
  });

  it("a By model table: the same total in the text and the PDF", () => {
    const rows = purchasesByModel(bought[SUPP], sentBack[SUPP]);
    const t = modelTotal(rows);
    expect(modelText("Purchases by model", rows, name)).toContain(
      `*Total: ${t.pieces} pcs · ${format(t.amount)}*`,
    );
    const table = modelSection("Purchases by model", rows, name)!.table!;
    expect(table.total).toEqual(["Total", String(t.pieces), "", format(t.amount)]);
    expect(modelText("x", [], name)).toBeNull();
  });

  it("U-CR-033.6 every By model output shows the same Avg unit price; Total has none", () => {
    // Statement By model: the PDF column, the message phrase and the Excel cell.
    const rows = purchasesByModel(bought[SUPP], sentBack[SUPP]);
    const table = modelSection("Purchases by model", rows, name)!.table!;
    expect(table.heads).toEqual(["Model", "Pieces", "Avg unit price", "Amount"]);
    const text = modelText("Purchases by model", rows, name)!;
    const excel = modelSheet("Purchases by model", rows, name);
    expect(excel.columns.map((c) => c.header)).toEqual(table.heads);
    rows.forEach((r, i) => {
      expect(table.rows[i][2]).toBe(format(r.avg!));
      expect(text).toContain(`- ${name(r.id)}: ${piecesAt(r)} · ${format(r.amount)}`);
      expect(excel.rows[i][2]).toBe(r.avg);
    });
    expect(excel.rows.at(-1)![2]).toBeNull();
    const sum = (w: string[]) => w.reduce((n, x) => n + Number.parseFloat(x), 0);
    expect(sum(table.widths!)).toBe(100);

    // Sales report By model: the PDF, the Excel and the message; By customer has no average.
    const line = { customerId: "c", modelId: "m", unitCost: 100_000, reversal: false };
    const r = salesReport(
      [
        { ...line, saleId: "s1", qty: 2, unitPrice: 150_000 },
        { ...line, saleId: "s2", qty: 1, unitPrice: 160_000 },
      ],
      [{ ...line, qty: 1, unitAmount: 150_000 }],
    );
    const pdf = salesPdf({ report: r, from: "2026-10-01", to: "2026-10-31", name: () => "M" });
    const [byModel, byCustomer] = [pdf.sections[1].table!, pdf.sections[2].table!];
    expect(byModel.heads).toEqual(["Model", "Pieces", "Avg unit price", "Sales", "Profit"]);
    expect(byModel.rows[0][2]).toBe("৳1,533"); // 4,60,000 poisha ÷ 3, half-up to taka
    expect(byModel.total![2]).toBe("");
    expect(sum(byModel.widths!)).toBe(100);
    expect(byCustomer.heads).toEqual(["Customer", "Pieces", "Sales", "Profit"]);
    const sheets = salesSheets(r, () => "M");
    expect(sheet(sheets, "By model").rows[0][2]).toBe(153_300);
    expect(sheet(sheets, "By model").rows.at(-1)![2]).toBeNull();
    expect(sheet(sheets, "By customer").columns.map((c) => c.header)).not.toContain(
      "Avg unit price",
    );
    const message = salesText({ report: r, from: "2026-10-01", to: "2026-10-31", name: () => "M" });
    expect(message).toContain("- M: 2 pcs · avg ৳1,533 · ৳3,100 · profit ৳1,100");
  });

  it("the Monthly pack", () => {
    const { end, before } = packDates("2026-10", TODAY);
    const p = monthlyPack({
      month: "2026-10",
      today: TODAY,
      firstMonth: "2026-09",
      books,
      atStart: computeBooks(data, before),
      atEnd: computeBooks(data, end),
      snapshots,
      allocations: data.allocations,
      closed: data.closed,
      sales: salesReport([], []),
      stockLines: stock,
      typeOf,
      typeLabel: (t) => t,
    });
    const key = [
      p.profit.total,
      p.position.netAssets,
      stockTotal(p.stock).value,
      p.cash.closing,
    ].map(format);
    const text = packText(p, name);
    const pdf = pdfText(packPdf(p, name));
    for (const k of key) {
      expect(text).toContain(k);
      expect(pdf).toContain(k);
    }
    // The PDF fonts (Noto Sans + Bengali) have no ✓ or →: a PDF never prints them.
    expect(pdf).not.toMatch(/[✓→]/);
    expect(pdfText(investorPdf(investor(NADIM)))).not.toMatch(/[✓→]/);
    expect(text).toContain("_Open month — figures can still change_");
    expect(text).toContain("✓ The books balance");
    const sheets = packSheets(p, name);
    expect(row(sheet(sheets, "Profit & loss"), "Month profit")[1]).toBe(p.profit.total);
    expect(row(sheet(sheets, "Cash flow"), "Closing")[1]).toBe(p.cash.closing);
    expect(row(sheet(sheets, "Stock movement"), "Total").at(-1)).toBe(stockTotal(p.stock).value);
    expect(row(sheet(sheets, "Position"), "Difference (0 = ✓)")[1]).toBe(0);
  });

  it("U-CR-039.2 the pack's position lists Business assets, Total we owe and Net worth (D-064)", () => {
    const { end, before } = packDates("2026-10", TODAY);
    const p = monthlyPack({
      month: "2026-10",
      today: TODAY,
      firstMonth: "2026-09",
      books,
      atStart: computeBooks(data, before),
      atEnd: computeBooks(data, end),
      snapshots,
      allocations: data.allocations,
      closed: data.closed,
      sales: salesReport([], []),
      stockLines: stock,
      typeOf,
      typeLabel: (t) => t,
    });
    const b = p.position;
    const rows: [string, number][] = [
      ["Business assets", b.businessAssets],
      ["Total we owe", b.oweTotal],
      ["Net worth", b.netAssets],
      ["Total", b.equity],
    ];
    expect(b.netAssets).toBe(b.equity);
    const text = packText(p, name);
    const pdf = pdfText(packPdf(p, name));
    const position = sheet(packSheets(p, name), "Position");
    for (const [label, amount] of rows) {
      expect(text).toContain(`= ${label}: ${format(amount)}`);
      expect(pdf).toContain(`${label}\n${format(amount)}`);
      expect(row(position, label)[1]).toBe(amount);
    }
    for (const title of ["What we have", "What we owe", "Whose it is"]) {
      expect(text).toContain(`_${title}_`);
      expect(pdf).toContain(title);
      expect(row(position, title)[1]).toBeNull();
    }
    expect(text).not.toMatch(/Net assets|Equity/);
    expect(pdf).not.toMatch(/Net assets|Equity/);
  });

  it("the Sales PDF on the shared report layout keeps its totals and tables", () => {
    const r = salesReport(
      [
        {
          saleId: "s",
          customerId: "c",
          modelId: "m",
          qty: 2,
          unitPrice: 150_000,
          unitCost: 100_000,
          reversal: false,
        },
      ],
      [],
    );
    const doc = salesPdf({
      report: r,
      from: "2026-10-01",
      to: "2026-10-31",
      name: () => "Model M",
    });
    expect(doc.sections[0].facts?.at(-1)).toEqual(["Net sales profit", format(r.netProfit)]);
    expect(doc.sections.map((s) => s.title)).toEqual([undefined, "By model", "By customer"]);
  });
});
