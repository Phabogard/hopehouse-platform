-- Persist the provider-confirmed values used by reconciliation.
ALTER TABLE "mobile_money_recharge_attempts"
  ADD COLUMN "confirmed_amount_cents" BIGINT,
  ADD COLUMN "confirmed_currency" TEXT;

ALTER TABLE "mobile_money_recharge_attempts"
  ADD CONSTRAINT "mobile_money_recharge_attempts_confirmed_amount_positive"
  CHECK ("confirmed_amount_cents" IS NULL OR "confirmed_amount_cents" > 0);

ALTER TABLE "mobile_money_recharge_attempts"
  ADD CONSTRAINT "mobile_money_recharge_attempts_confirmed_currency_format"
  CHECK ("confirmed_currency" IS NULL OR "confirmed_currency" ~ '^[A-Za-z]{3}$');