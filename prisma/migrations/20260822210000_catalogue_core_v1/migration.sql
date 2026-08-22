-- Hope House Catalogue Core V1
-- Additive migration. Concrete networks/providers/services remain data, never code.

CREATE TYPE "CatalogStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "CatalogItemType" AS ENUM ('service', 'plan', 'unit', 'accessory', 'other');
CREATE TYPE "CatalogItemStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "ServiceDefinitionType" AS ENUM ('mobile_credit', 'internet', 'voice', 'sms', 'electricity', 'tv', 'accessory', 'ai', 'messaging', 'other');
CREATE TYPE "ServiceDefinitionStatus" AS ENUM ('draft', 'active', 'inactive', 'archived');
CREATE TYPE "ServiceModeType" AS ENUM ('manual', 'semi_automatic', 'automatic');
CREATE TYPE "PriceRuleStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "CommissionCalculationType" AS ENUM ('fixed', 'percentage');
CREATE TYPE "CommissionRuleStatus" AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE "CatalogueCurrency" AS ENUM ('USD', 'CDF');

CREATE TABLE "catalogs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "CatalogStatus" NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "catalogs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_items" (
  "id" TEXT NOT NULL,
  "catalog_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CatalogItemType" NOT NULL,
  "status" "CatalogItemStatus" NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "valid_from" TIMESTAMPTZ(3),
  "valid_until" TIMESTAMPTZ(3),
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_items_validity_check" CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" > "valid_from")
);

CREATE TABLE "networks" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CatalogStatus" NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "providers" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "CatalogStatus" NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_definitions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ServiceDefinitionType" NOT NULL,
  "network_id" TEXT,
  "provider_id" TEXT,
  "status" "ServiceDefinitionStatus" NOT NULL,
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_modes" (
  "id" TEXT NOT NULL,
  "service_definition_id" TEXT NOT NULL,
  "mode" "ServiceModeType" NOT NULL,
  "is_active" BOOLEAN NOT NULL,
  "configuration_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "service_modes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_rules" (
  "id" TEXT NOT NULL,
  "service_definition_id" TEXT NOT NULL,
  "currency" "CatalogueCurrency" NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "status" "PriceRuleStatus" NOT NULL,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "price_rules_amount_cents_check" CHECK ("amount_cents" >= 0),
  CONSTRAINT "price_rules_validity_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE TABLE "commission_rules" (
  "id" TEXT NOT NULL,
  "service_definition_id" TEXT NOT NULL,
  "currency" "CatalogueCurrency" NOT NULL,
  "calculation_type" "CommissionCalculationType" NOT NULL,
  "value" INTEGER NOT NULL,
  "status" "CommissionRuleStatus" NOT NULL,
  "starts_at" TIMESTAMPTZ(3),
  "ends_at" TIMESTAMPTZ(3),
  "metadata_json" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_rules_value_check" CHECK ("value" >= 0),
  CONSTRAINT "commission_rules_validity_check" CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE UNIQUE INDEX "catalogs_code_key" ON "catalogs"("code");
CREATE INDEX "catalogs_status_idx" ON "catalogs"("status");
CREATE INDEX "catalogs_type_status_idx" ON "catalogs"("type", "status");

CREATE UNIQUE INDEX "catalog_items_catalog_id_code_key" ON "catalog_items"("catalog_id", "code");
CREATE INDEX "catalog_items_catalog_id_status_idx" ON "catalog_items"("catalog_id", "status");
CREATE INDEX "catalog_items_type_status_idx" ON "catalog_items"("type", "status");
CREATE INDEX "catalog_items_valid_from_valid_until_idx" ON "catalog_items"("valid_from", "valid_until");
CREATE INDEX "catalog_items_created_by_user_id_idx" ON "catalog_items"("created_by_user_id");
CREATE INDEX "catalog_items_updated_by_user_id_idx" ON "catalog_items"("updated_by_user_id");

CREATE UNIQUE INDEX "networks_code_key" ON "networks"("code");
CREATE INDEX "networks_status_idx" ON "networks"("status");

CREATE UNIQUE INDEX "providers_code_key" ON "providers"("code");
CREATE INDEX "providers_type_status_idx" ON "providers"("type", "status");

CREATE UNIQUE INDEX "service_definitions_code_key" ON "service_definitions"("code");
CREATE INDEX "service_definitions_network_id_status_idx" ON "service_definitions"("network_id", "status");
CREATE INDEX "service_definitions_provider_id_status_idx" ON "service_definitions"("provider_id", "status");
CREATE INDEX "service_definitions_type_status_idx" ON "service_definitions"("type", "status");

CREATE UNIQUE INDEX "service_modes_service_definition_id_mode_key" ON "service_modes"("service_definition_id", "mode");
CREATE INDEX "service_modes_service_definition_id_is_active_idx" ON "service_modes"("service_definition_id", "is_active");

CREATE INDEX "price_rules_service_definition_id_currency_status_idx" ON "price_rules"("service_definition_id", "currency", "status");
CREATE INDEX "price_rules_status_starts_at_ends_at_idx" ON "price_rules"("status", "starts_at", "ends_at");

CREATE INDEX "commission_rules_service_definition_id_currency_status_idx" ON "commission_rules"("service_definition_id", "currency", "status");
CREATE INDEX "commission_rules_status_starts_at_ends_at_idx" ON "commission_rules"("status", "starts_at", "ends_at");

ALTER TABLE "catalog_items"
  ADD CONSTRAINT "catalog_items_catalog_id_fkey"
  FOREIGN KEY ("catalog_id") REFERENCES "catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_definitions"
  ADD CONSTRAINT "service_definitions_network_id_fkey"
  FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_definitions"
  ADD CONSTRAINT "service_definitions_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_modes"
  ADD CONSTRAINT "service_modes_service_definition_id_fkey"
  FOREIGN KEY ("service_definition_id") REFERENCES "service_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_service_definition_id_fkey"
  FOREIGN KEY ("service_definition_id") REFERENCES "service_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "commission_rules"
  ADD CONSTRAINT "commission_rules_service_definition_id_fkey"
  FOREIGN KEY ("service_definition_id") REFERENCES "service_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
