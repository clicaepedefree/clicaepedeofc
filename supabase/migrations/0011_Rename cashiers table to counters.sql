ALTER TABLE "cashiers" RENAME TO "counters";--> statement-breakpoint
ALTER TABLE "counters" DROP CONSTRAINT "cashiers_store_id_stores_id_fk";
--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;