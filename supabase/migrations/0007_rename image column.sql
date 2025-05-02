ALTER TABLE "categories" RENAME COLUMN "image" TO "image_id";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "categories_image_store_files_id_fk";
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_id_store_files_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."store_files"("id") ON DELETE no action ON UPDATE no action;