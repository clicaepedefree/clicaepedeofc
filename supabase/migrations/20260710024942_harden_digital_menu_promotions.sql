DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'digital_menu_promotions_valid_period_check'
  ) THEN
    ALTER TABLE "digital_menu_promotions"
      ADD CONSTRAINT "digital_menu_promotions_valid_period_check"
      CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "starts_at" <= "ends_at") NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'digital_menu_promotions_coupon_shape_check'
  ) THEN
    ALTER TABLE "digital_menu_promotions"
      ADD CONSTRAINT "digital_menu_promotions_coupon_shape_check"
      CHECK (
        (
          "type" <> 'FIXED_AMOUNT'
          OR ("code" IS NOT NULL AND "discount_amount" IS NOT NULL AND "discount_amount" > 0)
        )
        AND (
          "type" <> 'PERCENTAGE'
          OR ("code" IS NOT NULL AND "discount_percent" IS NOT NULL)
        )
        AND (
          "type" <> 'FREE_DELIVERY'
          OR "code" IS NOT NULL
        )
        AND (
          "type" <> 'FREE_DELIVERY_THRESHOLD'
          OR ("free_delivery_minimum" IS NOT NULL AND "free_delivery_minimum" > 0)
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "digital_menu_promotion_redemptions_customer_lookup_idx"
  ON "digital_menu_promotion_redemptions" ("promotion_id", "customer_hash", "created_at")
  WHERE "customer_hash" IS NOT NULL;
