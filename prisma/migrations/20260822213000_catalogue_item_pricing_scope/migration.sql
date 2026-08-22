-- Hope House — Catalogue pricing scope correction
-- Price and commission rules may apply to the whole service or to one sellable catalog item.
-- Nullable catalog_item_id preserves service-level rules while enabling per-offer pricing.

ALTER TABLE "price_rules"
  ADD COLUMN "catalog_item_id" TEXT;

ALTER TABLE "commission_rules"
  ADD COLUMN "catalog_item_id" TEXT;

CREATE INDEX "price_rules_catalog_item_id_currency_status_idx"
  ON "price_rules"("catalog_item_id", "currency", "status");

CREATE INDEX "commission_rules_catalog_item_id_currency_status_idx"
  ON "commission_rules"("catalog_item_id", "currency", "status");

ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_catalog_item_id_fkey"
  FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_catalog_item_id_fkey"
  FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
