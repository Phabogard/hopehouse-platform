-- Hope House — enforce ownership between sellable catalog items and services.
-- A service-level PriceRule/CommissionRule remains valid when catalog_item_id IS NULL.
-- When catalog_item_id is present, the database requires the item to belong to the same service.

ALTER TABLE "catalog_items"
  ADD COLUMN "service_definition_id" TEXT;

CREATE INDEX "catalog_items_service_definition_id_status_idx"
  ON "catalog_items"("service_definition_id", "status");

ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_service_definition_id_fkey"
  FOREIGN KEY ("service_definition_id") REFERENCES "service_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "catalog_items_id_service_definition_id_key"
  ON "catalog_items"("id", "service_definition_id");

-- Backfill only when existing pricing/commission references identify one unambiguous service.
-- Never guess across conflicting service definitions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT catalog_item_id
      FROM (
        SELECT catalog_item_id, service_definition_id FROM "price_rules" WHERE catalog_item_id IS NOT NULL
        UNION
        SELECT catalog_item_id, service_definition_id FROM "commission_rules" WHERE catalog_item_id IS NOT NULL
      ) refs
      GROUP BY catalog_item_id
      HAVING COUNT(DISTINCT service_definition_id) > 1
    ) conflicts
  ) THEN
    RAISE EXCEPTION 'Catalogue migration aborted: a catalog item is referenced by multiple service definitions; ownership cannot be inferred safely';
  END IF;
END $$;

UPDATE "catalog_items" ci
SET "service_definition_id" = refs.service_definition_id
FROM (
  SELECT catalog_item_id, MIN(service_definition_id) AS service_definition_id
  FROM (
    SELECT catalog_item_id, service_definition_id FROM "price_rules" WHERE catalog_item_id IS NOT NULL
    UNION
    SELECT catalog_item_id, service_definition_id FROM "commission_rules" WHERE catalog_item_id IS NOT NULL
  ) r
  GROUP BY catalog_item_id
) refs
WHERE ci.id = refs.catalog_item_id
  AND ci.service_definition_id IS NULL;

ALTER TABLE "price_rules"
  DROP CONSTRAINT "price_rules_catalog_item_id_fkey";

ALTER TABLE "commission_rules"
  DROP CONSTRAINT "commission_rules_catalog_item_id_fkey";

ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_catalog_item_service_definition_fkey"
  FOREIGN KEY ("service_definition_id", "catalog_item_id")
  REFERENCES "catalog_items"("service_definition_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_catalog_item_service_definition_fkey"
  FOREIGN KEY ("service_definition_id", "catalog_item_id")
  REFERENCES "catalog_items"("service_definition_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
