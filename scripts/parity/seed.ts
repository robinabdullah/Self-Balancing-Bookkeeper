// N-1.1: the parity book. A fictional business (D-069) written straight to the tables with fixed
// ids, names and created_at stamps, so every run (and both builds) sees the same rows. Like
// tests/integration/books.test.ts, it keeps the engine entries it writes, and the August close is
// computed from them by the engine, as the close action would.
import { createCipheriv, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { type StoredEntry, toPosted } from "@/lib/engine/index";
import { type Allocation, computeClose, monthProfit } from "@/lib/engine/months";
import type { MoneyEntry, Partner, PurchaseEntry, ReturnEntry } from "@/lib/engine/post";
import { parse, toDecimal } from "@/lib/money";
import { E2E_CARD_KEY, PARTNER } from "../../tests/e2e/helpers";
import { linkPartner } from "../../tests/e2e/global-setup";
import { truncateAll } from "../../tests/integration/local-db";
import { PARITY_TODAY } from "./config";

/** A fixed uuid per seeded row: `00000000-0000-4000-8000-<n>`. */
export const pid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const ids = {
  arif: pid(11),
  nadim: pid(12),
  kamal: pid(13), // an investor
  visa: pid(21), // Arif · EBL Visa
  amex: pid(22), // Nadim · City Amex
  rahman: pid(31),
  star: pid(32),
  alpha: pid(41),
  beta: pid(42),
  galaxy: pid(51),
  redmi: pid(52),
  iphone: pid(53),
  bankOwn: pid(61),
  bankRahman: pid(62),
};

/** Active partners by name (as the loader lists them); the first takes the splitShares residual. */
const partners: Partner[] = [
  { id: ids.arif, pct: 50 },
  { id: ids.nadim, pct: 50 },
];

const tk = (taka: string) => parse(taka) as number;
const dec = (poisha: number | null | undefined) => (poisha == null ? null : toDecimal(poisha));

/** The rows a run writes, in order; the ids the manifest needs are kept by name. */
export type Seeded = {
  entries: StoredEntry[];
  allocations: Allocation[];
  refs: Record<string, string>;
};

export async function seedParity(sql: postgres.Sql): Promise<Seeded> {
  let next = 1000; // entry and line ids
  let seq = 0; // created_at order
  const entries: StoredEntry[] = [];
  const refs: Record<string, string> = {};
  /** A distinct created_at at 10:00 Dhaka on the entry's date; later rows get later seconds. */
  const stamp = (date: string) =>
    new Date(Date.parse(`${date}T04:00:00.000Z`) + ++seq * 1000).toISOString();

  await truncateAll(sql);
  await linkPartner(sql);
  await sql`update profiles set theme = 'night_owl'
    where user_id = (select id from auth.users where email = ${PARTNER.email})`;
  // Numbers continue from the seeded ones (`setval` below), the same on every run.
  await sql`alter sequence sales_invoice_no_seq restart with 1`;
  await sql`alter sequence money_entries_receipt_no_seq restart with 1`;

  const setupAt = stamp("2026-07-31");
  await sql`update business_profile set name = 'Demo Business Shop', short_name = 'Demo Shop',
    address = 'House 12, Road 5, Dhanmondi, Dhaka', phones = '01700000001, 01800000001',
    whatsapp = '01700000001', email = 'hello@demo-shop.test', trade_licence = 'TRAD/DNCC/012345',
    tin = '123456789012', bin = '000123456-0101', invoice_terms = 'Goods once sold are not taken back.',
    receipt_terms = 'Thank you for your payment.', statement_terms = 'Please pay within 7 days.',
    footer = 'Demo Business Shop · Dhanmondi', templates = '{}',
    created_at = ${setupAt}, updated_at = ${setupAt}`;

  await sql`insert into people (id, name, kind, profit_share_pct, phone, created_at, updated_at)
    values (${ids.arif}, 'Arif', 'partner', 50, '01711000001', ${setupAt}, ${setupAt}),
      (${ids.nadim}, 'Nadim', 'partner', 50, '01711000002', ${setupAt}, ${setupAt}),
      (${ids.kamal}, 'Kamal', 'investor', null, '01711000003', ${setupAt}, ${setupAt})`;
  await sql`insert into cards (id, name, network, owner_person_id, statement_day, due_day,
      credit_limit, created_at, updated_at)
    values (${ids.visa}, 'EBL', 'visa', ${ids.arif}, 10, 25, 300000, ${setupAt}, ${setupAt}),
      (${ids.amex}, 'City', 'amex', ${ids.nadim}, 18, 3, 200000, ${setupAt}, ${setupAt})`;
  await sql`insert into customers (id, proprietor_name, shop_name, phone, whatsapp, address,
      target_balance, created_at, updated_at)
    values (${ids.rahman}, 'Kabir', 'Rahman Telecom', '01911000001', '01911000001',
        'Shop 4, Gulistan, Dhaka', 150000, ${setupAt}, ${setupAt}),
      (${ids.star}, 'Babul', 'Star Mobile', '01911000002', null, null, null, ${setupAt},
        ${setupAt})`;
  await sql`insert into suppliers (id, name, phone, created_at, updated_at)
    values (${ids.alpha}, 'Alpha Distributors', '01511000001', ${setupAt}, ${setupAt}),
      (${ids.beta}, 'Beta Traders', null, ${setupAt}, ${setupAt})`;
  await sql`insert into models (id, name, created_at, updated_at)
    values (${ids.galaxy}, 'Galaxy A15', ${setupAt}, ${setupAt}),
      (${ids.redmi}, 'Redmi Note 13', ${setupAt}, ${setupAt}),
      (${ids.iphone}, 'iPhone 13', ${setupAt}, ${setupAt})`;
  await sql`insert into bank_accounts (id, person_id, customer_id, bank_name, branch, account_name,
      account_number, routing_number, created_at, updated_at)
    values (${ids.bankOwn}, null, null, 'Dutch-Bangla Bank', 'Dhanmondi', 'Demo Business Shop',
        '1234567890123', '090261234', ${setupAt}, ${setupAt}),
      (${ids.bankRahman}, null, ${ids.rahman}, 'BRAC Bank', 'Gulistan', 'Kabir', '2001234567',
        null, ${setupAt}, ${setupAt})`;
  await sealCard(sql, ids.visa, { number: "4111111111111111", holder: "ARIF", expiry: "08/29" });
  await sql`insert into card_bill_dates (card_id, bill_month, actual_statement_date,
      actual_due_date, created_at, updated_at)
    values (${ids.visa}, '2026-09-01', '2026-09-11', '2026-09-27', ${setupAt}, ${setupAt})`;

  type Head = { date: string; ref?: string; reversesId?: string | null };
  const keep = (h: Head, id: string) => {
    if (h.ref) refs[h.ref] = id;
  };

  async function purchase(
    h: Head & Partial<Omit<PurchaseEntry, "lines" | "table" | "date">>,
    lines: { modelId: string; qty: number; unitCost: number }[],
  ) {
    const e: PurchaseEntry & StoredEntry = {
      table: "purchase",
      id: pid(next++),
      date: h.date,
      createdAt: stamp(h.date),
      reversesId: h.reversesId ?? null,
      source: h.source ?? "cash",
      cardId: h.cardId ?? null,
      supplierId: h.supplierId ?? null,
      customerId: h.customerId ?? null,
      emiMonths: h.emiMonths ?? null,
      billMonthOverride: h.billMonthOverride ?? null,
      lines: lines.map(({ qty, unitCost }) => ({ qty, unitCost })),
    };
    await sql`insert into purchases (id, date, source, card_id, supplier_id, customer_id,
        emi_months, bill_month_override, reverses_id, created_at, updated_at)
      values (${e.id}, ${e.date}, ${e.source}, ${e.cardId ?? null}, ${e.supplierId ?? null},
        ${e.customerId ?? null}, ${e.emiMonths ?? null}, ${e.billMonthOverride ?? null},
        ${e.reversesId ?? null}, ${e.createdAt}, ${e.createdAt})`;
    const lots: string[] = [];
    for (const l of lines) {
      const lot = pid(next++);
      const at = stamp(h.date);
      lots.push(lot);
      await sql`insert into purchase_lines (id, purchase_id, model_id, qty, unit_cost,
          created_at, updated_at)
        values (${lot}, ${e.id}, ${l.modelId}, ${l.qty}, ${toDecimal(l.unitCost)}, ${at}, ${at})`;
    }
    entries.push(e);
    keep(h, e.id);
    return lots;
  }

  type SaleLine = { lotId: string; qty: number; unitPrice: number; unitCost: number };
  let invoiceNo = 0;
  async function sale(h: Head & { customerId: string }, lines: SaleLine[]) {
    const e: StoredEntry = {
      table: "sale",
      id: pid(next++),
      date: h.date,
      createdAt: stamp(h.date),
      reversesId: h.reversesId ?? null,
      customerId: h.customerId,
      lines: lines.map(({ qty, unitPrice, unitCost }) => ({ qty, unitPrice, unitCost })),
    };
    await sql`insert into sales (id, date, customer_id, invoice_no, reverses_id, created_at,
        updated_at)
      values (${e.id}, ${e.date}, ${h.customerId}, ${h.reversesId ? null : ++invoiceNo},
        ${e.reversesId ?? null}, ${e.createdAt}, ${e.createdAt})`;
    const lineIds: string[] = [];
    for (const l of lines) {
      const lineId = pid(next++);
      const at = stamp(h.date);
      lineIds.push(lineId);
      await sql`insert into sale_lines (id, sale_id, lot_id, qty, unit_price, created_at,
          updated_at)
        values (${lineId}, ${e.id}, ${l.lotId}, ${l.qty}, ${toDecimal(l.unitPrice)}, ${at}, ${at})`;
    }
    entries.push(e);
    keep(h, e.id);
    return lineIds;
  }

  type ReturnLine = {
    lotId: string;
    saleLineId?: string;
    qty: number;
    unitAmount: number;
    unitCost: number;
  };
  async function giveBack(
    h: Head & Partial<Omit<ReturnEntry, "lines" | "table" | "date">> & Pick<ReturnEntry, "kind">,
    lines: ReturnLine[],
  ) {
    const e: ReturnEntry & StoredEntry = {
      table: "return",
      id: pid(next++),
      date: h.date,
      createdAt: stamp(h.date),
      reversesId: h.reversesId ?? null,
      kind: h.kind,
      customerId: h.customerId ?? null,
      cardId: h.cardId ?? null,
      supplierId: h.supplierId ?? null,
      refundTo: h.refundTo ?? null,
      reason: h.reason ?? null,
      lines: lines.map(({ qty, unitAmount, unitCost }) => ({ qty, unitAmount, unitCost })),
    };
    await sql`insert into returns (id, kind, date, customer_id, card_id, supplier_id, refund_to,
        reason, reverses_id, created_at, updated_at)
      values (${e.id}, ${e.kind}, ${e.date}, ${e.customerId ?? null}, ${e.cardId ?? null},
        ${e.supplierId ?? null}, ${e.refundTo ?? null}, ${e.reason ?? null},
        ${e.reversesId ?? null}, ${e.createdAt}, ${e.createdAt})`;
    for (const l of lines) {
      const at = stamp(h.date);
      await sql`insert into return_lines (id, return_id, sale_line_id, lot_id, qty, unit_amount,
          created_at, updated_at)
        values (${pid(next++)}, ${e.id}, ${l.saleLineId ?? null}, ${l.lotId}, ${l.qty},
          ${toDecimal(l.unitAmount)}, ${at}, ${at})`;
    }
    entries.push(e);
    keep(h, e.id);
  }

  let receiptNo = 0;
  async function money(m: Head & Partial<Omit<MoneyEntry, "table" | "date">>) {
    const e: MoneyEntry & StoredEntry = {
      table: "money",
      id: pid(next++),
      date: m.date,
      createdAt: stamp(m.date),
      reversesId: m.reversesId ?? null,
      type: m.type ?? "customer_payment",
      amount: m.amount ?? 0,
      forMonth: m.forMonth ?? null,
      customerId: m.customerId ?? null,
      supplierId: m.supplierId ?? null,
      cardId: m.cardId ?? null,
      personId: m.personId ?? null,
      source: m.source ?? null,
      category: m.category ?? null,
      cardCharged: m.cardCharged ?? null,
      cashReceived: m.cashReceived ?? null,
      settleMode: m.settleMode ?? null,
      billMonthOverride: m.billMonthOverride ?? null,
      emiMonths: m.emiMonths ?? null,
      openingKind: m.openingKind ?? null,
    };
    const receipt = e.type === "customer_payment" && !e.reversesId ? ++receiptNo : null;
    await sql`insert into money_entries (id, type, date, amount, for_month, customer_id,
        supplier_id, card_id, person_id, source, category, card_charged, cash_received,
        settle_mode, bill_month_override, emi_months, opening_kind, receipt_no, reverses_id,
        created_at, updated_at)
      values (${e.id}, ${e.type}, ${e.date}, ${toDecimal(e.amount)}, ${e.forMonth ?? null},
        ${e.customerId ?? null}, ${e.supplierId ?? null}, ${e.cardId ?? null},
        ${e.personId ?? null}, ${e.source ?? null}, ${e.category ?? null},
        ${dec(e.cardCharged)}, ${dec(e.cashReceived)}, ${e.settleMode ?? null},
        ${e.billMonthOverride ?? null}, ${e.emiMonths ?? null}, ${e.openingKind ?? null},
        ${receipt}, ${e.reversesId ?? null}, ${e.createdAt}, ${e.createdAt})`;
    entries.push(e);
    keep(m, e.id);
    return e.id;
  }

  const rahman = { customerId: ids.rahman };
  const star = { customerId: ids.star };

  // August (closed below): the opening, the first stock, sales, a return and money of each side.
  await money({ date: "2026-08-01", type: "opening", openingKind: "cash", amount: tk("200000") });
  for (const personId of [ids.arif, ids.nadim])
    await money({
      date: "2026-08-01",
      type: "opening",
      openingKind: "opening_difference",
      personId,
      amount: tk("100000"),
    });
  const [galaxyLot] = await purchase(
    { date: "2026-08-02", source: "cash", supplierId: ids.alpha, ref: "cashPurchase" },
    [{ modelId: ids.galaxy, qty: 10, unitCost: tk("18000") }],
  );
  const [iphoneLot] = await purchase(
    { date: "2026-08-03", source: "card", cardId: ids.visa, supplierId: ids.beta, emiMonths: 3 },
    [{ modelId: ids.iphone, qty: 2, unitCost: tk("72000") }],
  );
  const [redmiLot] = await purchase(
    { date: "2026-08-05", source: "supplier_credit", supplierId: ids.alpha },
    [{ modelId: ids.redmi, qty: 8, unitCost: tk("15000") }],
  );
  await sale({ date: "2026-08-07", ...rahman, ref: "invoice" }, [
    { lotId: galaxyLot, qty: 4, unitPrice: tk("21000"), unitCost: tk("18000") },
    { lotId: iphoneLot, qty: 1, unitPrice: tk("80000"), unitCost: tk("72000") },
  ]);
  const [starLine] = await sale({ date: "2026-08-09", ...star }, [
    { lotId: redmiLot, qty: 3, unitPrice: tk("17500"), unitCost: tk("15000") },
  ]);
  await money({ date: "2026-08-11", amount: tk("60000"), ...rahman, ref: "receipt" });
  await giveBack({ date: "2026-08-12", kind: "customer", ...star }, [
    { lotId: redmiLot, saleLineId: starLine, qty: 1, unitAmount: tk("17500"), unitCost: tk("15000") },
  ]);
  await money({
    date: "2026-08-14",
    type: "expense",
    source: "cash",
    category: "salary",
    forMonth: "2026-08-01",
    amount: tk("15000"),
  });
  await money({
    date: "2026-08-15",
    type: "card_cash_out",
    cardId: ids.amex,
    amount: tk("30000"),
    cardCharged: tk("30000"),
    cashReceived: tk("29400"),
  });
  await money({
    date: "2026-08-18",
    type: "supplier_payment",
    supplierId: ids.alpha,
    source: "cash",
    amount: tk("50000"),
  });
  await money({ date: "2026-08-20", type: "capital_in", personId: ids.kamal, amount: tk("500000") });
  await money({ date: "2026-08-25", type: "card_payment", cardId: ids.visa, amount: tk("40000") });

  // September (open): more stock and sales, a purchase return, a payment reversed and re-paid.
  const [galaxyLot2] = await purchase(
    { date: "2026-09-02", source: "cash", supplierId: ids.alpha, ref: "purchase" },
    [{ modelId: ids.galaxy, qty: 5, unitCost: tk("17800") }],
  );
  await sale({ date: "2026-09-04", ...rahman }, [
    { lotId: galaxyLot, qty: 3, unitPrice: tk("21500"), unitCost: tk("18000") },
    { lotId: galaxyLot2, qty: 2, unitPrice: tk("21000"), unitCost: tk("17800") },
  ]);
  const paid = await money({ date: "2026-09-06", amount: tk("30000"), ...star });
  await giveBack(
    {
      date: "2026-09-08",
      kind: "purchase",
      supplierId: ids.alpha,
      refundTo: "supplier",
      reason: "returned",
      ref: "return",
    },
    [{ lotId: redmiLot, qty: 1, unitAmount: tk("15000"), unitCost: tk("15000") }],
  );
  await money({
    date: "2026-09-10",
    type: "customer_profit_share",
    settleMode: "added_to_due",
    forMonth: "2026-09-01",
    amount: tk("2000"),
    ...rahman,
  });
  await money({
    date: "2026-09-12",
    type: "expense",
    source: "card",
    cardId: ids.visa,
    category: "delivery",
    forMonth: "2026-09-01",
    amount: tk("1200"),
    ref: "expense",
  });
  await money({
    date: "2026-09-15",
    type: "card_fee",
    cardId: ids.amex,
    category: "card fee/interest",
    amount: tk("500"),
  });
  await sale({ date: "2026-09-18", ...star }, [
    { lotId: iphoneLot, qty: 1, unitPrice: tk("79000"), unitCost: tk("72000") },
  ]);
  await money({ date: "2026-09-21", amount: tk("30000"), ...star, reversesId: paid, ref: "reversal" });
  await money({ date: "2026-09-22", amount: tk("30000"), ...star });
  await money({ date: "2026-09-25", type: "profit_paid", personId: ids.kamal, amount: tk("10000") });
  await money({ date: "2026-09-28", type: "cashback", source: "cash", amount: tk("300") });

  // October (this month, up to the harness's today).
  await purchase({ date: "2026-10-02", source: "customer_offset", ...rahman }, [
    { modelId: ids.redmi, qty: 1, unitCost: tk("14000") },
  ]);
  await sale({ date: "2026-10-05", ...rahman, ref: "sale" }, [
    { lotId: redmiLot, qty: 2, unitPrice: tk("17000"), unitCost: tk("15000") },
  ]);
  await money({ date: "2026-10-08", type: "customer_cash_given", amount: tk("5000"), ...star });
  await money({ date: "2026-10-10", type: "customer_discount", amount: tk("500"), ...rahman });
  await money({
    date: "2026-10-12",
    type: "capital_out",
    personId: ids.arif,
    source: "cash",
    amount: tk("8000"),
  });
  await giveBack({ date: "2026-10-14", kind: "purchase", reason: "damaged_lost" }, [
    { lotId: galaxyLot2, qty: 1, unitAmount: 0, unitCost: tk("17800") },
  ]);
  await money({ date: "2026-10-15", amount: tk("50000"), ...rahman });
  await money({
    date: "2026-10-16",
    type: "supplier_payment",
    supplierId: ids.alpha,
    source: "card",
    cardId: ids.visa,
    amount: tk("20000"),
  });
  await money({
    date: "2026-10-19",
    type: "opening_correction",
    openingKind: "customer_due",
    amount: tk("1000"),
    ...star,
  });

  await sql`select setval('sales_invoice_no_seq', ${invoiceNo})`;
  await sql`select setval('money_entries_receipt_no_seq', ${receiptNo})`;

  // Close August as the close form would: Kamal's 2% of his capital, the rest to the partners.
  const posted = entries.map((e) => toPosted(e, partners));
  const profit = monthProfit(posted, "2026-08", PARITY_TODAY);
  const kamal: Allocation = {
    month: "2026-08-01",
    personId: ids.kamal,
    kind: "cash",
    basis: tk("500000"),
    ratePct: 2,
    amount: tk("10000"),
  };
  const allocations: Allocation[] = [
    kamal,
    ...computeClose(profit, [kamal], partners).map((a) => ({
      ...a,
      month: "2026-08-01",
      basis: null,
      ratePct: null,
    })),
  ];
  const closedAt = stamp("2026-09-02");
  for (const a of allocations)
    await sql`insert into allocations (id, month, person_id, kind, basis, rate_pct, amount,
        created_at, updated_at)
      values (${pid(next++)}, ${a.month}, ${a.personId}, ${a.kind}, ${dec(a.basis)},
        ${a.ratePct ?? null}, ${toDecimal(a.amount)}, ${closedAt}, ${closedAt})`;
  await sql`insert into month_closes (id, month, close_date, snapshot, closed_by, created_at,
      updated_at)
    select ${pid(next++)}, '2026-08-01', '2026-09-02', ${JSON.stringify(profit)}::jsonb, id, ${closedAt},
      ${closedAt}
    from auth.users where email = ${PARTNER.email}`;

  return { entries, allocations, refs };
}

/** Saved card details, sealed as the app seals them (as tests/e2e/seed.ts does). Test numbers. */
async function sealCard(
  sql: postgres.Sql,
  cardId: string,
  d: { number: string; holder: string; expiry: string },
) {
  const seal = (text: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(E2E_CARD_KEY, "base64"), iv);
    cipher.setAAD(Buffer.from(cardId));
    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data].map((p) => p.toString("base64url")).join(".");
  };
  const at = "2026-07-31T04:00:00.000Z";
  await sql`insert into card_secrets (id, card_id, number, holder, expiry, last4, created_at,
      updated_at)
    values (${pid(71)}, ${cardId}, ${seal(d.number)}, ${seal(d.holder)}, ${seal(d.expiry)},
      ${d.number.slice(-4)}, ${at}, ${at})`;
}
