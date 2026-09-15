-- Hope House — Order Persistence Foundation V1

-- 1. Create Enums
CREATE TYPE "OrderStep" AS ENUM (
  'creation',
  'validation',
  'payment',
  'execution',
  'notification',
  'receipt',
  'history',
  'audit'
);

CREATE TYPE "OrderMode" AS ENUM (
  'manual',
  'semi_automatic',
  'automatic'
);

CREATE TYPE "OrderTransitionOutcome" AS ENUM (
  'succeeded',
  'failed'
);

-- 2. Create Table: orders
CREATE TABLE "orders" (
  "id" TEXT NOT NULL,
  "order_number" TEXT NOT NULL,
  "current_step" "OrderStep" NOT NULL DEFAULT 'creation',
  "service_definition_id" TEXT NOT NULL,
  "catalog_item_id" TEXT,
  "mode" "OrderMode" NOT NULL,
  "requester_actor_id" TEXT NOT NULL,
  "beneficiary_id" TEXT,
  "channel" TEXT,
  "amount_cents" BIGINT,
  "currency" TEXT,
  "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "orders_order_number_unique" UNIQUE ("order_number"),
  CONSTRAINT "orders_currency_format" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "orders_amount_cents_non_negative" CHECK ("amount_cents" IS NULL OR "amount_cents" >= 0)
);

-- Indexes
CREATE INDEX "orders_current_step_idx" ON "orders"("current_step");
CREATE INDEX "orders_service_definition_id_idx" ON "orders"("service_definition_id");
CREATE INDEX "orders_catalog_item_id_idx" ON "orders"("catalog_item_id");
CREATE INDEX "orders_requester_actor_id_idx" ON "orders"("requester_actor_id");
CREATE INDEX "orders_beneficiary_id_idx" ON "orders"("beneficiary_id");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- Foreign key constraints for Catalogue integrity
-- When catalog_item_id is present, the catalog item MUST belong to the specified service_definition_id.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_service_definition_fkey"
  FOREIGN KEY ("service_definition_id")
  REFERENCES "service_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_catalog_item_service_definition_fkey"
  FOREIGN KEY ("service_definition_id", "catalog_item_id")
  REFERENCES "catalog_items"("service_definition_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Create Table: order_transitions
CREATE TABLE "order_transitions" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "from_step" "OrderStep",
  "to_step" "OrderStep" NOT NULL,
  "outcome" "OrderTransitionOutcome" NOT NULL DEFAULT 'succeeded',
  "actor_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT "order_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_transitions_order_fkey"
  FOREIGN KEY ("order_id")
  REFERENCES "orders"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Indexes
CREATE INDEX "order_transitions_order_id_occurred_at_idx" ON "order_transitions"("order_id", "occurred_at");
