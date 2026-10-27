ALTER TABLE "cards" DROP CONSTRAINT "cards_name_unique";--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_owner_person_id_name_unique" UNIQUE("owner_person_id","name");