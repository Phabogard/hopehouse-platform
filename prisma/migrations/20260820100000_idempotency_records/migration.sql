CREATE TABLE "idempotency_records" (
  "key" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "result_reference" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key", "operation")
);

CREATE INDEX "idempotency_records_created_at_idx"
  ON "idempotency_records" ("created_at");
