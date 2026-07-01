CREATE UNIQUE INDEX IF NOT EXISTS "store_payment_methods_store_method_card_brand_null_safe_unique"
  ON "store_payment_methods" ("store_id", "method", COALESCE("card_brand", ''));
