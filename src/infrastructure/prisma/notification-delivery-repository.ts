import type {
  NotificationDeliveryRepository,
  NotificationDeliveryStatus,
} from '../../modules/notifications/notification-delivery.js';
import { parseDomainDate, toDomainIso } from './mappers.js';

type PrismaNotificationDeliveryRow = {
  readonly id: string;
  readonly deduplication_key: string;
  readonly device_id: string;
  readonly provider: string;
  readonly status: NotificationDeliveryStatus;
  readonly provider_message_id: string | null;
  readonly last_error: string | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
};

export interface PrismaNotificationDeliveryClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
};

export class PrismaNotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private readonly client: PrismaNotificationDeliveryClient) {}

  async claim(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly provider: string;
    readonly now: string;
  }): Promise<'claimed' | 'sent' | 'sending'> {
    const now = parseDomainDate(input.now, 'notification delivery claim');

    const inserted = await this.client.$queryRaw<readonly PrismaNotificationDeliveryRow[]>`
      INSERT INTO "notification_deliveries"
        ("id", "deduplication_key", "device_id", "provider", "status", "created_at", "updated_at")
      VALUES
        (gen_random_uuid()::text, ${input.deduplicationKey}, ${input.deviceId}, ${input.provider}, 'sending', ${now}, ${now})
      ON CONFLICT ("deduplication_key", "device_id") DO NOTHING
      RETURNING "id", "deduplication_key", "device_id", "provider", "status",
                "provider_message_id", "last_error", "created_at", "updated_at"
    `;
    if (inserted.length > 0) return 'claimed';

    const existing = await this.client.$queryRaw<readonly PrismaNotificationDeliveryRow[]>`
      SELECT "id", "deduplication_key", "device_id", "provider", "status",
             "provider_message_id", "last_error", "created_at", "updated_at"
      FROM "notification_deliveries"
      WHERE "deduplication_key" = ${input.deduplicationKey}
        AND "device_id" = ${input.deviceId}
      LIMIT 1
    `;
    const row = existing[0];
    if (row?.status === 'sent') return 'sent';
    if (row?.status === 'sending') return 'sending';

    const retried = await this.client.$queryRaw<readonly PrismaNotificationDeliveryRow[]>`
      UPDATE "notification_deliveries"
      SET "status" = 'sending', "last_error" = NULL, "updated_at" = ${now}
      WHERE "deduplication_key" = ${input.deduplicationKey}
        AND "device_id" = ${input.deviceId}
        AND "status" = 'failed'
      RETURNING "id", "deduplication_key", "device_id", "provider", "status",
                "provider_message_id", "last_error", "created_at", "updated_at"
    `;
    if (retried.length > 0) return 'claimed';

    return 'sending';
  }

  async markSent(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly providerMessageId: string;
    readonly now: string;
  }): Promise<void> {
    const now = parseDomainDate(input.now, 'notification delivery sent');
    await this.client.$queryRaw`
      UPDATE "notification_deliveries"
      SET "status" = 'sent',
          "provider_message_id" = ${input.providerMessageId},
          "last_error" = NULL,
          "updated_at" = ${now}
      WHERE "deduplication_key" = ${input.deduplicationKey}
        AND "device_id" = ${input.deviceId}
    `;
  }

  async markFailed(input: {
    readonly deduplicationKey: string;
    readonly deviceId: string;
    readonly error: string;
    readonly now: string;
  }): Promise<void> {
    const now = parseDomainDate(input.now, 'notification delivery failure');
    await this.client.$queryRaw`
      UPDATE "notification_deliveries"
      SET "status" = 'failed',
          "last_error" = ${input.error.slice(0, 4000)},
          "updated_at" = ${now}
      WHERE "deduplication_key" = ${input.deduplicationKey}
        AND "device_id" = ${input.deviceId}
        AND "status" = 'sending'
    `;
  }
}