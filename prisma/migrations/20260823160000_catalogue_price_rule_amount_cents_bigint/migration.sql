-- Hope House — Catalogue price rule amount_cents migration to BIGINT
-- Fixes F-01 (P1): Prevents 32-bit integer overflow on large monetary amounts in CDF.
-- Transforms price_rules.amount_cents from INTEGER to BIGINT while preserving CHECK constraints.

ALTER TABLE "price_rules"
  ALTER COLUMN "amount_cents" TYPE BIGINT;
