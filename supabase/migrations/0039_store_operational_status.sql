ALTER TABLE "store_digital_menu_settings"
  ADD COLUMN IF NOT EXISTS "operational_status" text DEFAULT 'OPEN' NOT NULL,
  ADD COLUMN IF NOT EXISTS "operational_status_message" text;

ALTER TABLE "store_digital_menu_settings"
  DROP CONSTRAINT IF EXISTS "store_digital_menu_settings_operational_status_check";

ALTER TABLE "store_digital_menu_settings"
  ADD CONSTRAINT "store_digital_menu_settings_operational_status_check"
  CHECK ("operational_status" IN ('OPEN', 'CLOSED', 'PAUSED', 'TAKEOUT_ONLY', 'DELIVERY_ONLY'));
