CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"index" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"category_id" integer NOT NULL,
	"category_name" text NOT NULL,
	"price" numeric(19, 4) NOT NULL,
	"original_price" numeric(19, 4),
	"quantity" numeric(19, 4) NOT NULL,
	"external_code" text,
	"ean" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_id" text NOT NULL,
	"store_id" integer NOT NULL,
	"type" text NOT NULL,
	"sales_channel" text NOT NULL,
	"pos_counter_id" integer,
	"pos_counter_name" text,
	"status" text NOT NULL,
	"total_price" numeric(19, 4) NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pos_counter_id_counters_id_fk" FOREIGN KEY ("pos_counter_id") REFERENCES "public"."counters"("id") ON DELETE no action ON UPDATE no action;