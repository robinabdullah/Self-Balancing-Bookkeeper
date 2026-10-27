CREATE TYPE "public"."allocation_kind" AS ENUM('cash', 'card', 'partner');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'delete', 'reverse', 'close', 'reopen', 'export');--> statement-breakpoint
CREATE TYPE "public"."money_type" AS ENUM('customer_payment', 'customer_cash_given', 'customer_discount', 'customer_profit_share', 'supplier_payment', 'card_payment', 'card_cash_out', 'card_fee', 'cashback', 'expense', 'capital_in', 'capital_out', 'profit_paid', 'profit_reinvested', 'opening', 'opening_correction');--> statement-breakpoint
CREATE TYPE "public"."opening_kind" AS ENUM('cash', 'customer_due', 'supplier_due', 'card_balance', 'capital', 'profit_owed', 'opening_difference');--> statement-breakpoint
CREATE TYPE "public"."pay_source" AS ENUM('cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."person_kind" AS ENUM('partner', 'investor');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('partner', 'investor', 'employee');--> statement-breakpoint
CREATE TYPE "public"."purchase_source" AS ENUM('cash', 'card', 'supplier_credit', 'customer_offset', 'opening', 'opening_correction');--> statement-breakpoint
CREATE TYPE "public"."refund_to" AS ENUM('cash', 'card', 'supplier', 'customer');--> statement-breakpoint
CREATE TYPE "public"."return_kind" AS ENUM('customer', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."return_reason" AS ENUM('returned', 'damaged_lost');--> statement-breakpoint
CREATE TYPE "public"."settle_mode" AS ENUM('received', 'added_to_due');--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"month" date NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "allocation_kind" NOT NULL,
	"basis" numeric(14, 2),
	"rate_pct" numeric(6, 3),
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "allocations_month_first_of_month" CHECK (extract(day from month) = 1),
	CONSTRAINT "allocations_basis_positive" CHECK (basis > 0),
	CONSTRAINT "allocations_investor_terms" CHECK (kind = 'partner' or (basis is not null and rate_pct is not null and amount >= 0))
);
--> statement-breakpoint
ALTER TABLE "allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"table" text NOT NULL,
	"row_id" uuid,
	"action" "audit_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "card_bill_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"card_id" uuid NOT NULL,
	"bill_month" date NOT NULL,
	"actual_statement_date" date,
	"actual_due_date" date,
	CONSTRAINT "card_bill_dates_card_id_bill_month_unique" UNIQUE("card_id","bill_month"),
	CONSTRAINT "card_bill_dates_bill_month_first_of_month" CHECK (extract(day from bill_month) = 1)
);
--> statement-breakpoint
ALTER TABLE "card_bill_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"owner_person_id" uuid NOT NULL,
	"statement_day" integer NOT NULL,
	"due_day" integer NOT NULL,
	"credit_limit" numeric(14, 2),
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "cards_name_unique" UNIQUE("name"),
	CONSTRAINT "cards_statement_day_range" CHECK (statement_day between 1 and 31),
	CONSTRAINT "cards_due_day_range" CHECK (due_day between 1 and 31),
	CONSTRAINT "cards_credit_limit_positive" CHECK (credit_limit > 0)
);
--> statement-breakpoint
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"shop_name" text,
	"proprietor_name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"target_balance" numeric(14, 2),
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "customers_shop_name_unique" UNIQUE("shop_name"),
	CONSTRAINT "customers_proprietor_name_shop_name_unique" UNIQUE NULLS NOT DISTINCT("proprietor_name","shop_name"),
	CONSTRAINT "customers_target_balance_positive" CHECK (target_balance > 0)
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "money_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"type" "money_type" NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"for_month" date,
	"customer_id" uuid,
	"supplier_id" uuid,
	"card_id" uuid,
	"person_id" uuid,
	"source" "pay_source",
	"category" text,
	"card_charged" numeric(14, 2),
	"cash_received" numeric(14, 2),
	"settle_mode" "settle_mode",
	"bill_month_override" date,
	"emi_months" integer,
	"opening_kind" "opening_kind",
	"reverses_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "money_entries_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "money_entries_amount_sign" CHECK (case when type in ('opening', 'opening_correction') then amount <> 0 else amount > 0 end),
	CONSTRAINT "money_entries_card_charged_positive" CHECK (card_charged > 0),
	CONSTRAINT "money_entries_cash_received_positive" CHECK (cash_received > 0),
	CONSTRAINT "money_entries_cash_received_max" CHECK (cash_received <= card_charged),
	CONSTRAINT "money_entries_emi_months_min" CHECK (emi_months >= 2),
	CONSTRAINT "money_entries_for_month_first_of_month" CHECK (extract(day from for_month) = 1),
	CONSTRAINT "money_entries_bill_month_override_first_of_month" CHECK (extract(day from bill_month_override) = 1),
	CONSTRAINT "money_entries_not_self" CHECK (reverses_id <> id)
);
--> statement-breakpoint
ALTER TABLE "money_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "month_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"month" date NOT NULL,
	"close_date" date NOT NULL,
	"snapshot" jsonb NOT NULL,
	"closed_by" uuid NOT NULL,
	CONSTRAINT "month_closes_month_unique" UNIQUE("month"),
	CONSTRAINT "month_closes_month_first_of_month" CHECK (extract(day from month) = 1)
);
--> statement-breakpoint
ALTER TABLE "month_closes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"kind" "person_kind" NOT NULL,
	"profit_share_pct" numeric(6, 3),
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "people_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "profile_role" NOT NULL,
	"person_id" uuid,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"purchase_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" numeric(14, 2) NOT NULL,
	"imei_note" text,
	CONSTRAINT "purchase_lines_qty_positive" CHECK (qty > 0),
	CONSTRAINT "purchase_lines_unit_cost_positive" CHECK (unit_cost > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"date" date NOT NULL,
	"supplier_id" uuid,
	"source" "purchase_source" NOT NULL,
	"card_id" uuid,
	"customer_id" uuid,
	"emi_months" integer,
	"bill_month_override" date,
	"reverses_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "purchases_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "purchases_emi_months_min" CHECK (emi_months >= 2),
	CONSTRAINT "purchases_bill_month_override_first_of_month" CHECK (extract(day from bill_month_override) = 1),
	CONSTRAINT "purchases_not_self" CHECK (reverses_id <> id)
);
--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "return_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"return_id" uuid NOT NULL,
	"sale_line_id" uuid,
	"lot_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "return_lines_qty_positive" CHECK (qty > 0),
	CONSTRAINT "return_lines_unit_amount_min" CHECK (unit_amount >= 0)
);
--> statement-breakpoint
ALTER TABLE "return_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"kind" "return_kind" NOT NULL,
	"date" date NOT NULL,
	"customer_id" uuid,
	"card_id" uuid,
	"supplier_id" uuid,
	"refund_to" "refund_to",
	"reason" "return_reason",
	"reverses_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "returns_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "returns_not_self" CHECK (reverses_id <> id)
);
--> statement-breakpoint
ALTER TABLE "returns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"sale_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	CONSTRAINT "sale_lines_qty_positive" CHECK (qty > 0),
	CONSTRAINT "sale_lines_unit_price_min" CHECK (unit_price >= 0)
);
--> statement-breakpoint
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"date" date NOT NULL,
	"customer_id" uuid NOT NULL,
	"reverses_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "sales_reverses_id_unique" UNIQUE("reverses_id"),
	CONSTRAINT "sales_not_self" CHECK (reverses_id <> id)
);
--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_bill_dates" ADD CONSTRAINT "card_bill_dates_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_reverses_id_money_entries_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."money_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_reverses_id_purchases_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_lot_id_purchase_lines_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_reverses_id_returns_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_lot_id_purchase_lines_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_reverses_id_sales_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;