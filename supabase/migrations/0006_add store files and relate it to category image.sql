CREATE TABLE "store_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"creator_id" text NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"tag" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image" integer;--> statement-breakpoint
ALTER TABLE "store_files" ADD CONSTRAINT "store_files_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_image_store_files_id_fk" FOREIGN KEY ("image") REFERENCES "public"."store_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" DROP COLUMN "image_path";