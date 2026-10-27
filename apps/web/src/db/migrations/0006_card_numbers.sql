ALTER TABLE "card_secrets" DROP CONSTRAINT "card_secrets_card_id_unique";--> statement-breakpoint
ALTER TABLE "card_secrets" ADD COLUMN "supplementary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "card_secrets_card_id" ON "card_secrets" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_secrets_one_primary" ON "card_secrets" USING btree ("card_id") WHERE not "card_secrets"."supplementary";