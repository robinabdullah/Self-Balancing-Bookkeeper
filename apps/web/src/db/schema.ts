import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

// SRS §4. Only facts are stored: no balance columns, ever. Every table has RLS enabled with no
// policies (SRS §2.4), so the anon key reaches nothing; the app uses DATABASE_URL server-side.

// ---- Shared column helpers ----

const common = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // Auth user id; null for rows no session wrote: the seeded Walk-in, the opening import (SRS §9).
  createdBy: uuid("created_by"),
};

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const pct = (name: string) => numeric(name, { precision: 6, scale: 3 });
const day = (name: string) => date(name, { mode: "string" });
// A month is stored as the 1st of the month (SRS §3: `YYYY-MM` in the app).
const month = day;
const note = () => text("note").notNull().default("");
// Contact details (D-036): all optional.
const phone = () => text("phone");
const whatsapp = () => text("whatsapp");
const email = () => text("email");

const firstOfMonth = (table: string, col: string) =>
  check(`${table}_${col}_first_of_month`, sql.raw(`extract(day from ${col}) = 1`));
const positive = (table: string, col: string) =>
  check(`${table}_${col}_positive`, sql.raw(`${col} > 0`));
const notSelf = (table: string) => check(`${table}_not_self`, sql`reverses_id <> id`);

// ---- Enums ----

export const profileRole = pgEnum("profile_role", ["partner", "investor", "employee"]);
export const theme = pgEnum("theme", ["light", "dark", "night_owl"]);
// A card's Type (D-036); "none" until it is set, and the badge then reads the name.
export const cardNetwork = pgEnum("card_network", ["visa", "mastercard", "amex", "none"]);
export const personKind = pgEnum("person_kind", ["partner", "investor"]);
export const purchaseSource = pgEnum("purchase_source", [
  "cash",
  "card",
  "supplier_credit",
  "customer_offset",
  "opening",
  "opening_correction",
]);
export const returnKind = pgEnum("return_kind", ["customer", "purchase"]);
export const refundTo = pgEnum("refund_to", ["cash", "card", "supplier", "customer"]);
export const returnReason = pgEnum("return_reason", ["returned", "damaged_lost"]);
export const moneyType = pgEnum("money_type", [
  "customer_payment",
  "customer_cash_given",
  "customer_discount",
  "customer_profit_share",
  "supplier_payment",
  "card_payment",
  "card_cash_out",
  "card_fee",
  "cashback",
  "expense",
  "capital_in",
  "capital_out",
  "profit_paid",
  "profit_reinvested",
  "opening",
  "opening_correction",
]);
export const paySource = pgEnum("pay_source", ["cash", "card"]);
export const settleMode = pgEnum("settle_mode", ["received", "added_to_due"]);
export const openingKind = pgEnum("opening_kind", [
  "cash",
  "customer_due",
  "supplier_due",
  "card_balance",
  "capital",
  "profit_owed",
  "opening_difference",
]);
export const allocationKind = pgEnum("allocation_kind", ["cash", "card", "partner"]);
export const auditAction = pgEnum("audit_action", [
  "insert",
  "update",
  "delete",
  "reverse",
  "close",
  "reopen",
  "export",
  "reveal", // a card's details shown (CR-026), never the values
]);

// Invoice and receipt numbers (D-036): assigned at save in code, never to a reversal.
export const invoiceNoSeq = pgSequence("sales_invoice_no_seq");
export const receiptNoSeq = pgSequence("money_entries_receipt_no_seq");

// ---- Setup ----

export const people = pgTable("people", {
  ...common,
  name: text("name").notNull().unique(),
  kind: personKind("kind").notNull(),
  // Partners only; active partners must total 100 (checked at close and import).
  profitSharePct: pct("profit_share_pct"),
  note: text("note"),
  phone: phone(),
  whatsapp: whatsapp(),
  email: email(),
  active: boolean("active").notNull().default(true),
}).enableRLS();

export const profiles = pgTable("profiles", {
  ...common,
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => authUsers.id),
  name: text("name").notNull(),
  role: profileRole("role").notNull(),
  personId: uuid("person_id").references(() => people.id),
  theme: theme("theme").notNull().default("night_owl"),
}).enableRLS();

export const cards = pgTable(
  "cards",
  {
    ...common,
    name: text("name").notNull(),
    network: cardNetwork("network").notNull().default("none"),
    ownerPersonId: uuid("owner_person_id")
      .notNull()
      .references(() => people.id),
    statementDay: integer("statement_day").notNull(),
    dueDay: integer("due_day").notNull(),
    creditLimit: money("credit_limit"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    // D-022, D-036: each person's "Brac" Visa is its own card, apart from their "Brac" Mastercard.
    unique().on(t.ownerPersonId, t.name, t.network),
    check("cards_statement_day_range", sql`statement_day between 1 and 31`),
    check("cards_due_day_range", sql`due_day between 1 and 31`),
    positive("cards", "credit_limit"),
  ],
).enableRLS();

// Overrides only; the calculated dates come from the card's days (SRS §6).
export const cardBillDates = pgTable(
  "card_bill_dates",
  {
    ...common,
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id),
    billMonth: month("bill_month").notNull(),
    actualStatementDate: day("actual_statement_date"),
    actualDueDate: day("actual_due_date"),
  },
  (t) => [unique().on(t.cardId, t.billMonth), firstOfMonth("card_bill_dates", "bill_month")],
).enableRLS();

export const customers = pgTable(
  "customers",
  {
    ...common,
    shopName: text("shop_name").unique(),
    proprietorName: text("proprietor_name").notNull(),
    phone: phone(),
    whatsapp: whatsapp(),
    email: email(),
    address: text("address"),
    targetBalance: money("target_balance"),
    // The seeded Walk-in (D-009); read-only in Setup: no edit, deactivate or delete (D-023).
    isSystem: boolean("is_system").notNull().default(false),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    unique().on(t.proprietorName, t.shopName).nullsNotDistinct(),
    positive("customers", "target_balance"),
  ],
).enableRLS();

export const suppliers = pgTable("suppliers", {
  ...common,
  name: text("name").notNull().unique(),
  phone: phone(),
  whatsapp: whatsapp(),
  email: email(),
  active: boolean("active").notNull().default(true),
}).enableRLS();

export const models = pgTable("models", {
  ...common,
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
}).enableRLS();

// ---- Business and saved details (D-036; filled in by CR-019 and CR-026) ----

// One row (seeded by migration 0004), edited in Settings → Business.
export const businessProfile = pgTable(
  "business_profile",
  {
    ...common,
    name: text("name").notNull(),
    shortName: text("short_name"),
    address: text("address"),
    phones: text("phones"),
    whatsapp: whatsapp(),
    email: email(),
    tradeLicence: text("trade_licence"),
    tin: text("tin"),
    bin: text("bin"),
    // Each document's own terms (D-049), then the footer line on every customer PDF.
    invoiceTerms: text("invoice_terms"),
    receiptTerms: text("receipt_terms"),
    statementTerms: text("statement_terms"),
    footer: text("footer"),
    // A ≤ 256 px image as a data URL; left out of the export (Excel's cell limit).
    logo: text("logo"),
    // Greeting and sign-off per message type.
    templates: jsonb("templates").notNull().default({}),
  },
  () => [uniqueIndex("business_profile_one_row").on(sql`(true)`)],
).enableRLS();

// No owner = the business's own account. A cascading key: they go with their owner and don't
// count as "used" in Setup.
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    ...common,
    personId: uuid("person_id").references(() => people.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "cascade" }),
    bankName: text("bank_name").notNull(),
    branch: text("branch"),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    routingNumber: text("routing_number"),
    note: note(),
    active: boolean("active").notNull().default(true),
  },
  () => [
    check("bank_accounts_one_owner", sql`num_nonnulls(person_id, customer_id, supplier_id) <= 1`),
    check("bank_accounts_routing_number", sql`routing_number ~ '^[0-9]{9}$'`),
  ],
).enableRLS();

// Encrypted (AES-256-GCM, key on the server only); never exported, logged or audited with values.
export const cardSecrets = pgTable(
  "card_secrets",
  {
    ...common,
    // D-054: a card holds its primary and supplementary numbers (one bill), at most one primary.
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    supplementary: boolean("supplementary").notNull().default(false),
    number: text("number").notNull(),
    holder: text("holder"),
    expiry: text("expiry"),
    cvv: text("cvv"),
    last4: text("last4").notNull(),
  },
  (t) => [
    check("card_secrets_last4", sql`last4 ~ '^[0-9]{4}$'`),
    index("card_secrets_card_id").on(t.cardId),
    uniqueIndex("card_secrets_one_primary")
      .on(t.cardId)
      .where(sql`not ${t.supplementary}`),
  ],
).enableRLS();

// WebAuthn (fingerprint) credentials and one-time challenges; never exported.
export const passkeys = pgTable("passkeys", {
  ...common,
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transports: jsonb("transports"), // string[]: no Postgres arrays (`fetch_types: false`, db/index.ts)
  deviceName: text("device_name"),
}).enableRLS();

export const passkeyChallenges = pgTable("passkey_challenges", {
  ...common,
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  challenge: text("challenge").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}).enableRLS();

// ---- Trade ----

export const purchases = pgTable(
  "purchases",
  {
    ...common,
    date: day("date").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    source: purchaseSource("source").notNull(),
    cardId: uuid("card_id").references(() => cards.id),
    customerId: uuid("customer_id").references(() => customers.id),
    emiMonths: integer("emi_months"),
    billMonthOverride: month("bill_month_override"),
    // At most one reversal per entry.
    reversesId: uuid("reverses_id")
      .unique()
      .references((): AnyPgColumn => purchases.id),
    note: note(),
  },
  () => [
    check("purchases_emi_months_min", sql`emi_months >= 2`),
    firstOfMonth("purchases", "bill_month_override"),
    notSelf("purchases"),
  ],
).enableRLS();

// A purchase line is a lot.
export const purchaseLines = pgTable(
  "purchase_lines",
  {
    ...common,
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    modelId: uuid("model_id")
      .notNull()
      .references(() => models.id),
    qty: integer("qty").notNull(),
    unitCost: money("unit_cost").notNull(),
    imeiNote: text("imei_note"),
  },
  () => [positive("purchase_lines", "qty"), positive("purchase_lines", "unit_cost")],
).enableRLS();

export const sales = pgTable(
  "sales",
  {
    ...common,
    date: day("date").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    invoiceNo: integer("invoice_no").unique(),
    reversesId: uuid("reverses_id")
      .unique()
      .references((): AnyPgColumn => sales.id),
    note: note(),
  },
  () => [
    notSelf("sales"),
    check("sales_invoice_no_not_reversal", sql`invoice_no is null or reverses_id is null`),
  ],
).enableRLS();

export const saleLines = pgTable(
  "sale_lines",
  {
    ...common,
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => purchaseLines.id),
    qty: integer("qty").notNull(),
    // ≥ 0: a loss is allowed.
    unitPrice: money("unit_price").notNull(),
  },
  () => [positive("sale_lines", "qty"), check("sale_lines_unit_price_min", sql`unit_price >= 0`)],
).enableRLS();

export const returns = pgTable(
  "returns",
  {
    ...common,
    kind: returnKind("kind").notNull(),
    date: day("date").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    cardId: uuid("card_id").references(() => cards.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    refundTo: refundTo("refund_to"),
    // Purchase returns only; damaged_lost is the v1 write-off (refund 0).
    reason: returnReason("reason"),
    reversesId: uuid("reverses_id")
      .unique()
      .references((): AnyPgColumn => returns.id),
    note: note(),
  },
  () => [notSelf("returns")],
).enableRLS();

export const returnLines = pgTable(
  "return_lines",
  {
    ...common,
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    saleLineId: uuid("sale_line_id").references(() => saleLines.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => purchaseLines.id),
    qty: integer("qty").notNull(),
    // Refund price per unit (≥ 0).
    unitAmount: money("unit_amount").notNull(),
  },
  () => [
    positive("return_lines", "qty"),
    check("return_lines_unit_amount_min", sql`unit_amount >= 0`),
  ],
).enableRLS();

// ---- Money ----

// One table for every single-amount entry. Allowed fields per type are validated by Zod (the
// source of truth); the DB checks only the critical ones.
export const moneyEntries = pgTable(
  "money_entries",
  {
    ...common,
    type: moneyType("type").notNull(),
    date: day("date").notNull(),
    amount: money("amount").notNull(),
    forMonth: month("for_month"),
    customerId: uuid("customer_id").references(() => customers.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    cardId: uuid("card_id").references(() => cards.id),
    personId: uuid("person_id").references(() => people.id),
    source: paySource("source"),
    category: text("category"),
    cardCharged: money("card_charged"),
    cashReceived: money("cash_received"),
    settleMode: settleMode("settle_mode"),
    billMonthOverride: month("bill_month_override"),
    emiMonths: integer("emi_months"),
    openingKind: openingKind("opening_kind"),
    receiptNo: integer("receipt_no").unique(),
    reversesId: uuid("reverses_id")
      .unique()
      .references((): AnyPgColumn => moneyEntries.id),
    note: note(),
  },
  () => [
    // Opening items are signed (≠ 0); everything else is > 0.
    check(
      "money_entries_amount_sign",
      sql`case when type in ('opening', 'opening_correction') then amount <> 0 else amount > 0 end`,
    ),
    positive("money_entries", "card_charged"),
    positive("money_entries", "cash_received"),
    check("money_entries_cash_received_max", sql`cash_received <= card_charged`),
    check("money_entries_emi_months_min", sql`emi_months >= 2`),
    firstOfMonth("money_entries", "for_month"),
    firstOfMonth("money_entries", "bill_month_override"),
    notSelf("money_entries"),
    check(
      "money_entries_receipt_no_payment",
      sql`receipt_no is null or (type = 'customer_payment' and reverses_id is null)`,
    ),
  ],
).enableRLS();

// ---- Month close ----

// A row exists only while the month is closed; re-open deletes it (kept in the audit log).
export const monthCloses = pgTable(
  "month_closes",
  {
    ...common,
    month: month("month").notNull().unique(),
    closeDate: day("close_date").notNull(),
    // Engine output for that month, for display.
    snapshot: jsonb("snapshot").notNull(),
    closedBy: uuid("closed_by").notNull(),
  },
  () => [firstOfMonth("month_closes", "month")],
).enableRLS();

// The stored facts for closed months: Σ amount for a month = Profit(M) at close.
export const allocations = pgTable(
  "allocations",
  {
    ...common,
    month: month("month").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    kind: allocationKind("kind").notNull(),
    basis: money("basis"),
    ratePct: pct("rate_pct"),
    // cash/card (investors): ≥ 0; partner: from splitShares, may be negative.
    amount: money("amount").notNull(),
  },
  () => [
    firstOfMonth("allocations", "month"),
    positive("allocations", "basis"),
    check(
      "allocations_investor_terms",
      sql`kind = 'partner' or (basis is not null and rate_pct is not null and amount >= 0)`,
    ),
  ],
).enableRLS();

// ---- Audit ----

// An export writes one row with no row_id (D-017).
export const auditLog = pgTable("audit_log", {
  ...common,
  table: text("table").notNull(),
  rowId: uuid("row_id"),
  action: auditAction("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  userId: uuid("user_id").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
