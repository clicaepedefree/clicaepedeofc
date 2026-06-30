ALTER TABLE "store_digital_menu_settings"
ADD COLUMN IF NOT EXISTS "banner_file_id" integer REFERENCES "store_files"("id") ON DELETE set null;
