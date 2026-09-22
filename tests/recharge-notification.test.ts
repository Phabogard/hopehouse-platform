import test from 'node:test';
import assert from 'node:assert/strict';
import { RechargeNotificationConsumer } from '../src/modules/notifications/recharge-notification-consumer.js';
import { InMemoryNotificationTransport } from '../src/modules/notifications/notification-transport.js';
import type { IdempotencyRecord, IdempotencyStore } from '../src/core/idempotency/idempotency.js';
import type { DomainEventEnvelope } from '../src/core/events/domain-event.js';

class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  async find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    return this.records.get(`${key}:${operation}`) ?? null;
  }

  async save(record: IdempotencyRecord): Promise<boolean> {
    const compositeKey = `${record.key}:${record.operation}`;
    if (this.records.has(compositeKey)) return false;
    this.records.set(compositeKey, record);
    return true;
  }
}

const sampleEvent: DomainEventEnvelope<{
  rechargeAttemptId: string;
  walletId: string;
  orderId: string;
  receiptId: string;
  receiptNumber: string;
  amountCents: number;
  currency: string;
  type: 'recharge_confirmed';
}> = {
  eventId: 'EVT-NOTIF-001',
  eventType: 'wallet.recharge_notification_requested',
  schemaVersion: 1,
  occurredAt: '2026-09-22T10:00:00.000Z',
  correlationId: 'ATT-001',
  causationId: null,
  aggregateId: 'WAL-001',
  aggregateType: 'wallet',
  payload: {
    rechargeAttemptId: 'ATT-001',
    walletId: 'WAL-001',
    orderId: 'ORD-001',
    receiptId: 'REC-001',
    receiptNumber: 'RCH-ATT-001',
    amountCents: 20000,
    currency: 'USD',
    type: 'recharge_confirmed',
  },
};

test('RechargeNotificationConsumer: processes notification on first delivery', async () => {
  const transport = new InMemoryNotificationTransport();
  const idempotency = new InMemoryIdempotencyStore();
  const consumer = new RechargeNotificationConsumer(transport, idempotency);

  const res = await consumer.handle(sampleEvent);

  assert.equal(res.processed, true);
  assert.ok(res.notification);
  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]?.recipientId, 'WAL-001');
  assert.equal(transport.sent[0]?.template, 'recharge_confirmed');
});

test('RechargeNotificationConsumer: guarantees idempotency on event redelivery', async () => {
  const transport = new InMemoryNotificationTransport();
  const idempotency = new InMemoryIdempotencyStore();
  const consumer = new RechargeNotificationConsumer(transport, idempotency);

  // First delivery
  const res1 = await consumer.handle(sampleEvent);
  assert.equal(res1.processed, true);
  assert.equal(transport.sent.length, 1);

  // Redelivery of exact same event
  const res2 = await consumer.handle(sampleEvent);
  assert.equal(res2.processed, true);
  assert.equal(res2.notification, undefined);
  assert.equal(transport.sent.length, 1, 'No duplicate notification sent');
});

test('RechargeNotificationConsumer: handles transport failure and allows retry', async () => {
  let shouldFail = true;
  const failingTransport = {
    async send(input: any) {
      if (shouldFail) {
        throw new Error('Network transport temporary failure');
      }
      return { id: 'NOTIF-RETRY', recipientId: input.recipientId, template: input.template, channel: input.channel, payload: input.payload, sentAt: new Date().toISOString() };
    },
  };

  const idempotency = new InMemoryIdempotencyStore();
  const consumer = new RechargeNotificationConsumer(failingTransport, idempotency);

  // First attempt fails
  await assert.rejects(
    async () => consumer.handle(sampleEvent),
    (err: unknown) => err instanceof Error && err.message.includes('Network transport temporary failure'),
  );

  // Retry succeeds after transport recovers
  shouldFail = false;
  const res = await consumer.handle(sampleEvent);
  assert.equal(res.processed, true);
  assert.equal(res.notification?.id, 'NOTIF-RETRY');
});

test('RechargeNotificationConsumer: ignores unhandled event types', async () => {
  const transport = new InMemoryNotificationTransport();
  const idempotency = new InMemoryIdempotencyStore();
  const consumer = new RechargeNotificationConsumer(transport, idempotency);

  const otherEvent: DomainEventEnvelope<any> = { ...sampleEvent, eventType: 'other.event' };
  const res = await consumer.handle(otherEvent);

  assert.equal(res.processed, false);
  assert.equal(transport.sent.length, 0);
});
