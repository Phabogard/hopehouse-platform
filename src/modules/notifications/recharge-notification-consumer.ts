import type { DomainEventEnvelope } from '../../core/events/domain-event.js';
import type { IdempotencyStore } from '../../core/idempotency/idempotency.js';
import type { NotificationTransport, SentNotification } from './notification-transport.js';

export interface RechargeNotificationPayload {
  readonly rechargeAttemptId: string;
  readonly walletId: string;
  readonly orderId: string;
  readonly receiptId: string;
  readonly receiptNumber: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly type: 'recharge_confirmed';
}

export class RechargeNotificationConsumer {
  constructor(
    private readonly transport: NotificationTransport,
    private readonly idempotencyStore: IdempotencyStore,
  ) {}

  async handle(event: DomainEventEnvelope<RechargeNotificationPayload>): Promise<{ processed: boolean; notification?: SentNotification }> {
    if (event.eventType !== 'wallet.recharge_notification_requested') {
      return { processed: false };
    }

    const operation = 'notification.recharge_confirmed';
    const key = `notification:${event.eventId}`;

    const existing = await this.idempotencyStore.find(key, operation);
    if (existing) {
      return { processed: true };
    }

    const notification = await this.transport.send({
      recipientId: event.payload.walletId,
      template: 'recharge_confirmed',
      channel: 'in_app',
      payload: {
        rechargeAttemptId: event.payload.rechargeAttemptId,
        receiptNumber: event.payload.receiptNumber,
        amountCents: event.payload.amountCents,
        currency: event.payload.currency,
      },
    });

    await this.idempotencyStore.save({
      key,
      operation,
      resultReference: notification.id,
      createdAt: new Date().toISOString(),
    });

    return { processed: true, notification };
  }
}
