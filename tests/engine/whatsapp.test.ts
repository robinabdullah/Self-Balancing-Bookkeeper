import { describe, expect, it } from "vitest";
import { statementRange } from "@mbl/domain/accounts";
import {
  compose,
  discountText,
  howToPayText,
  mergeLines,
  paymentText,
  profitShareText,
  reminderText,
  returnText,
  saleText,
  statementText,
  waLink,
  waNumber,
} from "@mbl/domain/whatsapp";

// D-040: every message, laid out like the v1.1 plan's samples (sample data, not the partners').
const SHOP = "Demo Business Shop";
const KARIM = { name: "Rahman Telecom (Karim)", walkIn: false };
const WALK_IN = { name: "Walk-in", walkIn: true };
const AT = "10 Oct 2026, 3:45 PM";

describe("U-CR-020.2 messages", () => {
  it("Sale: the long layout, several models, Received now as one pair", () => {
    const text = saleText({
      shop: SHOP,
      invoiceNo: 42,
      savedAt: AT,
      customer: KARIM,
      items: [
        { model: "Redmi 13 8/256", qty: 2, unitPrice: 1_750_000 },
        { model: "Galaxy A15 4/128", qty: 1, unitPrice: 1_980_000 },
        { model: "Realme C61 4/64", qty: 3, unitPrice: 1_120_000 },
        { model: "Honor X5c 4/64", qty: 2, unitPrice: 985_000 },
      ],
      paidNow: 4_000_000,
      dues: { previous: 10_500_000, now: 17_310_000, today: null },
    });
    expect(text).toBe(
      [
        "🧾 *Demo Business Shop*",
        "*Invoice INV-0042* · 10 Oct 2026, 3:45 PM",
        "👤 Rahman Telecom (Karim)",
        "",
        "📱 *Items*",
        "1. Redmi 13 8/256 × 2 @ ৳17,500 = ৳35,000",
        "2. Galaxy A15 4/128 × 1 @ ৳19,800 = ৳19,800",
        "3. Realme C61 4/64 × 3 @ ৳11,200 = ৳33,600",
        "4. Honor X5c 4/64 × 2 @ ৳9,850 = ৳19,700",
        "*Total: ৳1,08,100* (8 pcs)",
        "",
        "📒 *Your account*",
        "- Previous due: ৳1,05,000",
        "- This bill: +৳1,08,100",
        "- Paid now: -৳40,000",
        "- *Due now: ৳1,73,100*",
      ].join("\n"),
    );
  });

  it("Sale: a line split over two lots is shown once; newer entries add Due today", () => {
    const text = saleText({
      shop: SHOP,
      invoiceNo: 7,
      savedAt: "08 Oct 2026",
      customer: KARIM,
      items: [
        { model: "Galaxy A15", qty: 1, unitPrice: 1_980_000 },
        { model: "Galaxy A15", qty: 2, unitPrice: 1_980_000 },
      ],
      paidNow: 0,
      dues: { previous: 0, now: 5_940_000, today: 4_000_000 },
    });
    expect(text).toContain("1. Galaxy A15 × 3 @ ৳19,800 = ৳59,400\n*Total: ৳59,400* (3 pcs)");
    expect(text).not.toContain("2. ");
    expect(text).not.toContain("Paid now");
    expect(text).toContain("*Invoice INV-0007* · 08 Oct 2026");
    expect(text).toContain("- *Due now: ৳59,400*\n- Due today: ৳40,000");
  });

  it("Sale: Walk-in has no account section and no customer line", () => {
    const text = saleText({
      shop: SHOP,
      invoiceNo: null,
      savedAt: AT,
      customer: WALK_IN,
      items: [{ model: "Galaxy A15", qty: 1, unitPrice: 1_980_000 }],
      paidNow: 1_980_000,
      dues: { previous: 0, now: 0, today: null },
    });
    expect(text).toBe(
      [
        "🧾 *Demo Business Shop*",
        "*Invoice* · 10 Oct 2026, 3:45 PM",
        "",
        "📱 *Items*",
        "1. Galaxy A15 × 1 @ ৳19,800 = ৳19,800",
        "*Total: ৳19,800* (1 pc)",
        "Paid: ৳19,800",
      ].join("\n"),
    );
  });

  it("a customer in credit reads Advance", () => {
    const text = paymentText({
      receiptNo: 3,
      savedAt: AT,
      customer: KARIM,
      amount: 5_000_000,
      dues: { previous: 1_000_000, now: -4_000_000, today: null },
    });
    expect(text).toContain("Previous due: ৳10,000\n*Advance: ৳40,000*");
    expect(
      paymentText({
        receiptNo: 3,
        savedAt: AT,
        customer: KARIM,
        amount: 100,
        dues: { previous: -100, now: -200, today: -300 },
      }),
    ).toContain("Previous advance: ৳1\n*Advance: ৳2*\nAdvance today: ৳3");
  });

  it("Payment in: MR number and the amount in words", () => {
    expect(
      paymentText({
        receiptNo: 17,
        savedAt: "10 Oct 2026, 4:10 PM",
        customer: KARIM,
        amount: 5_000_000,
        dues: { previous: 13_980_000, now: 8_980_000, today: null },
      }),
    ).toBe(
      [
        "✅ *Payment received — MR-0017*",
        "Rahman Telecom (Karim) · 10 Oct 2026, 4:10 PM",
        "",
        "Amount: *৳50,000*",
        "_Taka Fifty Thousand Only_",
        "",
        "Previous due: ৳1,39,800",
        "*Due now: ৳89,800*",
      ].join("\n"),
    );
  });

  it("Return", () => {
    expect(
      returnText({
        savedAt: "12 Oct 2026",
        customer: KARIM,
        items: [{ model: "Galaxy A15", qty: 1, unitPrice: 1_980_000 }],
        refund: 1_980_000,
        dues: { previous: 8_980_000, now: 7_000_000, today: null },
      }),
    ).toBe(
      [
        "↩️ *Return received* · 12 Oct 2026",
        "Rahman Telecom (Karim)",
        "",
        "- Galaxy A15 × 1 @ ৳19,800",
        "Refund to your due: -৳19,800",
        "",
        "*Due now: ৳70,000*",
      ].join("\n"),
    );
  });

  it("Discount and Profit share", () => {
    const dues = { previous: 7_000_000, now: 6_950_000, today: null };
    expect(discountText({ savedAt: "15 Oct 2026", customer: KARIM, amount: 50_000, dues })).toBe(
      [
        "🎁 *Discount* · 15 Oct 2026",
        "Rahman Telecom (Karim)",
        "Discount: ৳500",
        "*Due now: ৳69,500*",
      ].join("\n"),
    );
    const share = {
      savedAt: "16 Oct 2026",
      customer: KARIM,
      amount: 2_800_000,
      forMonth: "2026-09",
      dues: { previous: 6_950_000, now: 9_750_000, today: null },
    };
    expect(profitShareText({ ...share, toDue: true })).toBe(
      [
        "📈 *Profit share — Sep 2026* · 16 Oct 2026",
        "Rahman Telecom (Karim)",
        "Added to your due: ৳28,000",
        "*Due now: ৳97,500*",
      ].join("\n"),
    );
    expect(profitShareText({ ...share, toDue: false })).toContain("Paid to you in cash: ৳28,000");
  });

  it("Due reminder", () => {
    expect(
      reminderText({
        due: 9_750_000,
        asOf: "2026-10-20",
        lastPayment: { amount: 5_000_000, date: "2026-10-10" },
      }),
    ).toBe(
      [
        "🔔 *Payment reminder*",
        "Your due with us is *৳97,500* as of 20 Oct 2026.",
        "Last payment: ৳50,000 on 10 Oct 2026.",
      ].join("\n"),
    );
    expect(reminderText({ due: 100, asOf: "2026-10-20", lastPayment: null })).not.toContain("Last");
  });

  it("Statement for a period, each kind", () => {
    const rows = [
      { entryId: "a", date: "2026-09-10", amount: 10_500_000 },
      { entryId: "b", date: "2026-10-10", amount: 5_480_000 },
      { entryId: "c", date: "2026-10-10", amount: -5_000_000 },
      { entryId: "d", date: "2026-10-12", amount: -1_980_000 },
    ];
    const range = statementRange(rows, "2026-10-01", "2026-10-31");
    const names: Record<string, string> = {
      b: "Sale INV-0042",
      c: "Payment in MR-0017",
      d: "Customer return",
    };
    const base = { from: "2026-10-01", to: "2026-10-31", range, label: (id: string) => names[id] };
    expect(statementText({ ...base, kind: "customer", name: "Rahman Telecom (Karim)" })).toBe(
      [
        "📄 *Statement — Rahman Telecom (Karim)*",
        "01 Oct – 31 Oct 2026",
        "",
        "Opening due: ৳1,05,000",
        "- 10 Oct Sale INV-0042: +৳54,800",
        "- 10 Oct Payment in MR-0017: -৳50,000",
        "- 12 Oct Customer return: -৳19,800",
        "*Closing due: ৳90,000*",
      ].join("\n"),
    );
    expect(statementText({ ...base, kind: "supplier", name: "Star Tech" })).toContain(
      "Opening: We owe ৳1,05,000",
    );
    expect(statementText({ ...base, kind: "card", name: "Arif · EBL Visa" })).toContain(
      "📄 *Card statement — Arif · EBL Visa*",
    );
    expect(statementText({ ...base, kind: "person", name: "Nadim" })).toContain(
      "*Closing capital: ৳90,000*",
    );
    const empty = statementRange(rows, "2026-10-20", "2026-10-25");
    expect(statementText({ ...base, range: empty, kind: "customer", name: "X" })).toContain(
      "No entries in this period.",
    );
  });

  it("How to pay and compose", () => {
    const how = howToPayText([
      {
        bankName: "EBL",
        branch: "Gulshan branch",
        accountName: SHOP,
        accountNumber: "1041 0600 0000 1",
        routingNumber: "095000000",
      },
    ]);
    expect(how).toBe(
      [
        "🏦 *How to pay*",
        "- EBL · Gulshan branch",
        "  A/C name: Demo Business Shop",
        "  A/C no: 1041 0600 0000 1",
        "  Routing: 095000000",
      ].join("\n"),
    );
    expect(howToPayText([])).toBeNull();
    expect(compose(["Assalamu alaikum Karim bhai,", "body", null, "", "— Shop"])).toBe(
      "Assalamu alaikum Karim bhai,\n\nbody\n\n— Shop",
    );
  });

  it("a split line merges only with the same price", () => {
    expect(
      mergeLines([
        { model: "A", qty: 1, unitPrice: 100 },
        { model: "A", qty: 1, unitPrice: 200 },
        { model: "A", qty: 2, unitPrice: 100 },
      ]),
    ).toEqual([
      { model: "A", qty: 3, unitPrice: 100 },
      { model: "A", qty: 1, unitPrice: 200 },
    ]);
  });
});

describe("U-CR-020.3 the number to send to", () => {
  it.each([
    ["01800000001", "8801800000001"],
    ["+8801800000001", "8801800000001"],
    ["8801800000001", "8801800000001"],
    ["018-0000 0001", "8801800000001"],
    ["01700000001, 01800000001", "8801700000001"],
    ["1800000001", null],
    ["02 9123456", null],
    ["", null],
    [null, null],
  ])("%s → %s", (text, number) => {
    expect(waNumber(text)).toBe(number);
  });

  it("wa.me links", () => {
    expect(waLink("8801800000001", "Hi *you* & me")).toBe(
      "https://wa.me/8801800000001?text=Hi%20*you*%20%26%20me",
    );
    expect(waLink("8801800000001")).toBe("https://wa.me/8801800000001");
  });
});
