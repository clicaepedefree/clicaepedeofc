ALTER TABLE "category_products" RENAME TO "item_offerings";--> statement-breakpoint
ALTER TABLE "products" RENAME TO "items";--> statement-breakpoint
ALTER TABLE "catalog_categories" RENAME TO "menu_categories";--> statement-breakpoint
ALTER TABLE "catalog_category_products" RENAME TO "menu_item_offerings";--> statement-breakpoint
ALTER TABLE "catalogs" RENAME TO "menus";--> statement-breakpoint
ALTER TABLE "store_catalogs" RENAME TO "store_menus";--> statement-breakpoint
ALTER TABLE "menu_categories" RENAME COLUMN "catalog_id" TO "menu_id";--> statement-breakpoint
ALTER TABLE "menu_item_offerings" RENAME COLUMN "category_product_id" TO "item_offering_id";--> statement-breakpoint
ALTER TABLE "menu_item_offerings" RENAME COLUMN "catalog_id" TO "menu_id";--> statement-breakpoint
ALTER TABLE "item_offerings" RENAME COLUMN "product_id" TO "item_id";--> statement-breakpoint
ALTER TABLE "order_items" RENAME COLUMN "product_id" TO "item_id";--> statement-breakpoint
ALTER TABLE "order_items" RENAME COLUMN "product_name" TO "item_name";--> statement-breakpoint
ALTER TABLE "store_menus" RENAME COLUMN "catalog_id" TO "menu_id";--> statement-breakpoint
ALTER TABLE "menus" DROP CONSTRAINT "catalog_name_unique";--> statement-breakpoint
ALTER TABLE "menu_categories" DROP CONSTRAINT "catalog_categories_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "menu_categories" DROP CONSTRAINT "catalog_categories_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "menu_item_offerings" DROP CONSTRAINT "catalog_category_products_category_product_id_category_products_id_fk";
--> statement-breakpoint
ALTER TABLE "menu_item_offerings" DROP CONSTRAINT "catalog_category_products_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "item_offerings" DROP CONSTRAINT "category_products_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "item_offerings" DROP CONSTRAINT "category_products_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "products_store_id_stores_id_fk";
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "products_image_id_store_files_id_fk";
--> statement-breakpoint
ALTER TABLE "store_menus" DROP CONSTRAINT "store_catalogs_store_id_stores_id_fk";
--> statement-breakpoint
ALTER TABLE "store_menus" DROP CONSTRAINT "store_catalogs_catalog_id_catalogs_id_fk";
--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_offerings" ADD CONSTRAINT "menu_item_offerings_item_offering_id_item_offerings_id_fk" FOREIGN KEY ("item_offering_id") REFERENCES "public"."item_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_offerings" ADD CONSTRAINT "menu_item_offerings_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_offerings" ADD CONSTRAINT "item_offerings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_offerings" ADD CONSTRAINT "item_offerings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_image_id_store_files_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."store_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_menus" ADD CONSTRAINT "store_menus_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_menus" ADD CONSTRAINT "store_menus_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menus" ADD CONSTRAINT "menu_name_unique" UNIQUE("name");