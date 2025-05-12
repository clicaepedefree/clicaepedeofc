ALTER TABLE "products" ADD COLUMN "image_id" integer;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_image_id_store_files_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."store_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "image_path";