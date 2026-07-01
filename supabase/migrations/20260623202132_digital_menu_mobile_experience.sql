ALTER TABLE "store_digital_menu_settings"
ADD COLUMN IF NOT EXISTS "allow_item_observations" boolean DEFAULT true NOT NULL;

CREATE INDEX IF NOT EXISTS "categories_store_available_sort_idx"
ON "categories" ("store_id", "is_available", "index", "name");

CREATE INDEX IF NOT EXISTS "item_offerings_category_available_sort_idx"
ON "item_offerings" ("category_id", "is_available", "index");

CREATE INDEX IF NOT EXISTS "items_store_inventory_idx"
ON "items" ("store_id", "inventory");

CREATE INDEX IF NOT EXISTS "item_offering_option_groups_offering_sort_idx"
ON "item_offering_option_groups" ("item_offering_id", "index");

CREATE INDEX IF NOT EXISTS "options_group_sort_idx"
ON "options" ("option_group_id", "index");
