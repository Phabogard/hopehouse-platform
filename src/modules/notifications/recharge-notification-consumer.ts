import type { DomainEventEnvelope } from '../../core/events/domain-event.js';
import type { IdempotencyStore } from '../../core/idempotency/idempotency.js';
import type { NotificationTransport, SentNotification } from './notification-transport.js';
import type { NotificationRecipientResolver } from './notification-recipient-resolver.js';

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
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {}

  async handle(event: DomainEventEnvelope<RechargeNotificationPayload>): Promise<{ processed: boolean; notification?: SentNotification }> {
    if (event.eventType !== 'wallet.recharge_notification_requested') {
      return { processed: false };
    }

    const operation = 'notification.recharge_confirmed';
    const key = `notification:${event.eventId}`;
    const existing = await this.idempotencyStore.find(key, operation);
    if (existing) return { processed: true };

    const recipientId = await this.recipientResolver.resolveUserIdForWallet(event.payload.walletId);

    const notification = await this.transport.send({
      recipientId,
      template: 'recharge_confirmed',
      channel: 'push',
      deduplicationKey: key,
      payload: {
        rechargeAttemptId: event.payload.rechargeAttemptId,
        receiptId: event.payload.receiptId,
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
