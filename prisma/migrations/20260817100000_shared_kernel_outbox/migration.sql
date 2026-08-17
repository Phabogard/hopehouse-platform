CREATE TABLE "outbox_messages" (
  "id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT,
  "aggregate_id" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL,
  "published_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_messages_pending_idx"
  ON "outbox_messages" ("available_at", "created_at")
  WHERE "published_at" IS NULL;

CREATE INDEX "outbox_messages_correlation_idx"
  ON "outbox_messages" ("correlation_id", "occurred_at");

CREATE INDEX "outbox_messages_aggregate_idx"
  ON "outbox_messages" ("aggregate_type", "aggregate_id", "occurred_at");

CREATE INDEX "outbox_messages_type_idx"
  ON "outbox_messages" ("event_type", "occurred_at");
