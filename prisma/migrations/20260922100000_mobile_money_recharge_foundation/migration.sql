-- Hope House — Mobile Money Recharge Reconciliation Foundation V1

CREATE TYPE "MobileMoneyRechargeStatus" AS ENUM (
  'INITIATED',
  'AWAITING_PAYMENT',
  'PAYMENT_DETECTED',
  'RECONCILIATION_PENDING',
  'CONFIRMED',
  'WALLET_CREDITED',
  'RECEIPT_ISSUED',
  'EXPIRED',
  'CANCELLED',
  'REJECTED',
  'MISMATCH',
  'DUPLICATE',
  'FAILED'
);

CREATE TABLE "mobile_money_recharge_attempts" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "requested_amount_cents" BIGINT NOT NULL,
  "requested_currency" TEXT NOT NULL,
  "network" TEXT NOT NULL,
  "status" "MobileMoneyRechargeStatus" NOT NULL DEFAULT 'INITIATED',
  "external_reference" TEXT,
  "detected_at" TIMESTAMPTZ(3),
  "confirmed_at" TIMESTAMPTZ(3),
  "reviewed_by_actor_id" TEXT,
  "review_metadata_json" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT "mobile_money_recharge_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mobile_money_recharge_attempts_order_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "mobile_money_recharge_attempts_wallet_fkey"
    FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "mobile_money_recharge_attempts_amount_positive"
    CHECK ("requested_amount_cents" > 0),
  CONSTRAINT "mobile_money_recharge_attempts_currency_format"
    CHECK ("requested_currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "mobile_money_recharge_attempts_network_non_blank"
    CHECK (length(btrim("network")) > 0)
);

CREATE INDEX "mobile_money_recharge_attempts_order_created_at_idx"
  ON "mobile_money_recharge_attempts" ("order_id", "created_at");

CREATE INDEX "mobile_money_recharge_attempts_wallet_status_created_at_idx"
  ON "mobile_money_recharge_attempts" ("wallet_id", "status", "created_at");

CREATE INDEX "mobile_money_recharge_attempts_status_created_at_idx"
  ON "mobile_money_recharge_attempts" ("status", "created_at");

CREATE INDEX "mobile_money_recharge_attempts_external_reference_idx"
  ON "mobile_money_recharge_attempts" ("external_reference");

-- A provider reference is unique when supplied, while retries without a
-- provider reference remain possible for manual reconciliation.
CREATE UNIQUE INDEX "mobile_money_recharge_attempts_external_reference_unique"
  ON "mobile_money_recharge_attempts" ("external_reference")
  WHERE "external_reference" IS NOT NULL;
