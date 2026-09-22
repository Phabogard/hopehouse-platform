-- Notification device registrations remain provider-agnostic so Firebase, Web Push,
-- or another provider can be introduced without changing domain contracts.
CREATE TABLE "notification_devices" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "installation_id" TEXT NOT NULL,
  "registration_token" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "revoked_at" TIMESTAMPTZ(3),
  "metadata" JSONB NOT NULL,

  CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_devices_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_devices_user_provider_installation_unique"
  ON "notification_devices" ("user_id", "provider", "installation_id");

CREATE UNIQUE INDEX "notification_devices_provider_token_unique"
  ON "notification_devices" ("provider", "registration_token");

CREATE INDEX "notification_devices_user_status_idx"
  ON "notification_devices" ("user_id", "status");

CREATE INDEX "notification_devices_provider_platform_status_idx"
  ON "notification_devices" ("provider", "platform", "status");

CREATE INDEX "notification_devices_last_seen_at_idx"
  ON "notification_devices" ("last_seen_at");
