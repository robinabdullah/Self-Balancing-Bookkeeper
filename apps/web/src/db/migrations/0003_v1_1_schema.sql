CREATE TYPE "public"."card_network" AS ENUM('visa', 'mastercard', 'amex', 'none');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('light', 'dark', 'night_owl');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'reveal';--> statement-breakpoint
CREATE SEQUENCE "public"."sales_invoice_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."money_entries_receipt_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"person_id" uuid,
	"customer_id" uuid,
	"supplier_id" uuid,
	"bank_name" text NOT NULL,
	"branch" text,
	"account_name" text NOT NULL,
	"account_number" text NOT NULL,
	"routing_number" text,
	"note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "bank_accounts_one_owner" CHECK (num_nonnulls(person_id, customer_id, supplier_id) <= 1),
	CONSTRAINT "bank_accounts_routing_number" CHECK (routing_number ~ '^[0-9]{9}$')
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"short_name" text,
	"address" text,
	"phones" text,
	"whatsapp" text,
	"email" text,
	"trade_licence" text,
	"tin" text,
	"bin" text,
	"invoice_terms" text,
	"footer" text,
	"logo" text,
	"templates" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "card_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"card_id" uuid NOT NULL,
	"number" text NOT NULL,
	"holder" text,
	"expiry" text,
	"cvv" text,
	"last4" text NOT NULL,
	CONSTRAINT "card_secrets_card_id_unique" UNIQUE("card_id"),
	CONSTRAINT "card_secrets_last4" CHECK (last4 ~ '^[0-9]{4}$')
);
--> statement-breakpoint
ALTER TABLE "card_secrets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "passkey_challenges_challenge_unique" UNIQUE("challenge")
);
--> statement-breakpoint
ALTER TABLE "passkey_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"device_name" text,
	CONSTRAINT "passkeys_credential_id_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cards" DROP CONSTRAINT "cards_owner_person_id_name_unique";--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "network" "card_network" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "money_entries" ADD COLUMN "receipt_no" integer;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "theme" "theme" DEFAULT 'night_owl' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "invoice_no" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "whatsapp" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_secrets" ADD CONSTRAINT "card_secrets_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_profile_one_row" ON "business_profile" USING btree ((true));--> statement-breakpoint
-- D-036: number the existing sales and customer payments in (date, created_at) order, skipping
-- reversals, before the unique keys; the sequences then continue after the highest number.
UPDATE "sales" s SET "invoice_no" = n.no
FROM (SELECT id, row_number() OVER (ORDER BY date, created_at, id) AS no
      FROM "sales" WHERE reverses_id IS NULL) n
WHERE s.id = n.id;--> statement-breakpoint
UPDATE "money_entries" m SET "receipt_no" = n.no
FROM (SELECT id, row_number() OVER (ORDER BY date, created_at, id) AS no
      FROM "money_entries" WHERE type = 'customer_payment' AND reverses_id IS NULL) n
WHERE m.id = n.id;--> statement-breakpoint
SELECT setval('"public"."sales_invoice_no_seq"', coalesce((SELECT max(invoice_no) FROM "sales"), 0) + 1, false);--> statement-breakpoint
SELECT setval('"public"."money_entries_receipt_no_seq"', coalesce((SELECT max(receipt_no) FROM "money_entries"), 0) + 1, false);--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_person_id_name_network_unique" UNIQUE("owner_person_id","name","network");--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_receipt_no_unique" UNIQUE("receipt_no");--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_invoice_no_unique" UNIQUE("invoice_no");--> statement-breakpoint
ALTER TABLE "money_entries" ADD CONSTRAINT "money_entries_receipt_no_payment" CHECK (receipt_no is null or (type = 'customer_payment' and reverses_id is null));--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_invoice_no_not_reversal" CHECK (invoice_no is null or reverses_id is null);