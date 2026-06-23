ALTER TABLE "store_delivery_zones"
  DROP CONSTRAINT IF EXISTS "store_delivery_zones_type_check";

ALTER TABLE "store_delivery_zones"
  ADD CONSTRAINT "store_delivery_zones_type_check"
  CHECK ("type" IN ('FIXED', 'NEIGHBORHOOD', 'RADIUS', 'POSTAL_CODE'));
