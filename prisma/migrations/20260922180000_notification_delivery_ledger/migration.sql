CREATE TABLE "notification_deliveries" (
  "id" TEXT NOT NULL,
  "deduplication_key" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_deliveries_device_fkey"
    FOREIGN KEY ("device_id") REFERENCES "notification_devices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_deliveries_key_device_unique"
  ON "notification_deliveries" ("deduplication_key", "device_id");

CREATE INDEX "notification_deliveries_status_updated_at_idx"
  ON "notification_deliveries" ("status", "updated_at");

CREATE INDEX "notification_deliveries_device_created_at_idx"
  ON "notification_deliveries" ("device_id", "created_at");
