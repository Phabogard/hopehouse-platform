-- ============================================================================
-- Migration: 20260819120000_wallet_persistence_option_b
-- Module: Wallets (Option B - Composite Foreign Keys & Strict Checks)
-- ============================================================================

-- 1. Create Enums
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'RESERVATION_HOLD', 'RESERVATION_RELEASE', 'RESERVATION_CAPTURE', 'ROLLBACK');
CREATE TYPE "WalletTransactionStatus" AS ENUM ('SETTLED', 'FAILED');
CREATE TYPE "WalletReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CAPTURED', 'ROLLED_BACK');

-- 2. Create Table: wallets
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallets_owner_type_owner_id_unique" UNIQUE ("owner_type", "owner_id")
);

CREATE INDEX "wallets_owner_lookup_idx" ON "wallets"("owner_type", "owner_id");

-- 3. Create Table: wallet_balances
CREATE TABLE "wallet_balances" (
    "wallet_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "available_cents" BIGINT NOT NULL DEFAULT 0,
    "reserved_cents" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("wallet_id", "currency"),
    CONSTRAINT "wallet_balances_wallet_fk" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "wallet_balances_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "wallet_balances_available_non_negative" CHECK ("available_cents" >= 0),
    CONSTRAINT "wallet_balances_reserved_non_negative" CHECK ("reserved_cents" >= 0)
);

CREATE INDEX "wallet_balances_wallet_id_idx" ON "wallet_balances"("wallet_id");

-- 4. Create Table: wallet_transactions
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "status" "WalletTransactionStatus" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "transaction_key" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "reversal_of_transaction_id" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_transactions_wallet_fk" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Contrainte UNIQUE composite exigée pour OPTION B et relations composites cibles
    CONSTRAINT "wallet_transactions_wallet_id_id_unique" UNIQUE ("wallet_id", "id"),
    -- Clé étrangère composite pour reversal afin d'interdire tout rollback cross-wallet
    CONSTRAINT "wallet_transactions_reversal_composite_fk" FOREIGN KEY ("wallet_id", "reversal_of_transaction_id") REFERENCES "wallet_transactions"("wallet_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "wallet_transactions_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "wallet_transactions_amount_positive" CHECK ("amount_cents" > 0)
);

-- Index partiels conditionnels uniques
CREATE UNIQUE INDEX "wallet_transactions_idempotency_idx" ON "wallet_transactions" ("wallet_id", "transaction_key") WHERE "transaction_key" IS NOT NULL;
CREATE UNIQUE INDEX "wallet_transactions_reversal_unique_idx" ON "wallet_transactions" ("wallet_id", "reversal_of_transaction_id") WHERE "reversal_of_transaction_id" IS NOT NULL;
CREATE INDEX "wallet_transactions_occurred_at_idx" ON "wallet_transactions" ("wallet_id", "occurred_at" DESC);

-- 5. Create Table: wallet_reservations
CREATE TABLE "wallet_reservations" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "status" "WalletReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "created_by_transaction_id" TEXT NOT NULL,
    "closed_by_transaction_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata_json" JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT "wallet_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "wallet_reservations_wallet_fk" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Clés étrangères composites OPTION B verrouillant l'invariant cross-wallet strict
    CONSTRAINT "wallet_reservations_created_by_tx_composite_fk" FOREIGN KEY ("wallet_id", "created_by_transaction_id") REFERENCES "wallet_transactions"("wallet_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "wallet_reservations_closed_by_tx_composite_fk" FOREIGN KEY ("wallet_id", "closed_by_transaction_id") REFERENCES "wallet_transactions"("wallet_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "wallet_reservations_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "wallet_reservations_amount_positive" CHECK ("amount_cents" > 0)
);

CREATE INDEX "wallet_reservations_wallet_status_idx" ON "wallet_reservations" ("wallet_id", "status");
