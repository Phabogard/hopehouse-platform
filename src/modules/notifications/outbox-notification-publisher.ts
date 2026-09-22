import type { DomainEventEnvelope } from '../../core/events/domain-event.js';
import type { EventPublisher } from '../../core/outbox/outbox.js';
import type { RechargeNotificationConsumer } from './recharge-notification-consumer.js';

export class OutboxNotificationPublisher implements EventPublisher {
  constructor(private readonly consumer: RechargeNotificationConsumer) {}

  async publish(event: DomainEventEnvelope<unknown>): Promise<void> {
    if (event.eventType !== 'wallet.recharge_notification_requested') return;
    await this.consumer.handle(event as DomainEventEnvelope<any>);
  }
}
