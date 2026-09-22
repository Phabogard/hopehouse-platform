CREATE TABLE "wallet_receipts" (
  "id" TEXT NOT NULL,
  "recharge_attempt_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "receipt_number" TEXT NOT NULL,
  "amount_cents" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(3) NOT NULL,
  "metadata_json" JSONB NOT NULL,
  CONSTRAINT "wallet_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "wallet_receipts_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "wallet_receipts_currency_format" CHECK ("currency" ~ '^[A-Za-z]{3}$'),
  CONSTRAINT "wallet_receipts_recharge_attempt_id_fkey" FOREIGN KEY ("recharge_attempt_id") REFERENCES "mobile_money_recharge_attempts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "wallet_receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "wallet_receipts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "wallet_receipts_recharge_attempt_id_key" ON "wallet_receipts" ("recharge_attempt_id");
CREATE UNIQUE INDEX "wallet_receipts_receipt_number_key" ON "wallet_receipts" ("receipt_number");
CREATE INDEX "wallet_receipts_wallet_issued_at_idx" ON "wallet_receipts" ("wallet_id", "issued_at");
CREATE INDEX "wallet_receipts_order_issued_at_idx" ON "wallet_receipts" ("order_id", "issued_at");
