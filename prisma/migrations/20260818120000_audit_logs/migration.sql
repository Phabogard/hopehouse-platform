CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "metadata_json" JSONB NOT NULL,

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_occurred_idx"
  ON "audit_logs" ("actor_user_id", "occurred_at");

CREATE INDEX "audit_logs_entity_occurred_idx"
  ON "audit_logs" ("entity_type", "entity_id", "occurred_at");

CREATE INDEX "audit_logs_action_occurred_idx"
  ON "audit_logs" ("action", "occurred_at");

CREATE INDEX "audit_logs_outcome_occurred_idx"
  ON "audit_logs" ("outcome", "occurred_at");
