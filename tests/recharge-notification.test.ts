import test from 'node:test';
import assert from 'node:assert/strict';
import { RechargeNotificationConsumer } from '../src/modules/notifications/recharge-notification-consumer.js';
import { InMemoryNotificationTransport } from '../src/modules/notifications/notification-transport.js';
import type { IdempotencyRecord, IdempotencyStore } from '../src/core/idempotency/idempotency.js';

class Store implements IdempotencyStore {
  private readonly rows = new Map<string, IdempotencyRecord>();
  async find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    return this.rows.get(key + ':' + operation) ?? null;
  }
  async save(record: IdempotencyRecord): Promise<boolean> {
    const key = record.key + ':' + record.operation;
    if (this.rows.has(key)) return false;
    this.rows.set(key, record);
    return true;
  }
}

const event = {
  eventId: 'evt-1',
  eventType: 'wallet.recharge_notification_requested' as const,
  schemaVersion: 1,
  occurredAt: '2026-09-22T10:00:00.000Z',
  correlationId: 'att-1',
  causationId: null,
  aggregateId: 'wal-1',
  aggregateType: 'wallet',
  payload: {
    rechargeAttemptId: 'att-1',
    walletId: 'wal-1',
    orderId: 'ord-1',
    receiptId: 'rec-1',
    receiptNumber: 'RCH-att-1',
    amountCents: 2000,
    currency: 'USD',
    type: 'recharge_confirmed' as const,
  },
};

test('RechargeNotificationConsumer is idempotent on redelivery', async () => {
  const transport = new InMemoryNotificationTransport();
  const consumer = new RechargeNotificationConsumer(transport, new Store());

  await consumer.handle(event);
  await consumer.handle(event);

  assert.equal(transport.sent.length, 1);
  assert.equal(transport.sent[0]?.recipientId, 'wal-1');
  assert.equal(transport.sent[0]?.template, 'recharge_confirmed');
});

test('RechargeNotificationConsumer ignores unrelated events', async () => {
  const transport = new InMemoryNotificationTransport();
  const consumer = new RechargeNotificationConsumer(transport, new Store());
  const result = await consumer.handle({ ...event, eventType: 'wallet.recharge_credited' } as unknown as typeof event);
  assert.equal(result.processed, false);
  assert.equal(transport.sent.length, 0);
});


test('RechargeNotificationConsumer remains single-delivery under concurrent redelivery when transport deduplicates by key', async () => {
  const transport = new ConcurrentDeduplicatingTransport();
  const consumer = new RechargeNotificationConsumer(transport, new Store());

  const results = await Promise.all([consumer.handle(event), consumer.handle(event)]);

  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.processed), true);
  assert.equal(transport.sent.length, 1);
});

class ConcurrentDeduplicatingTransport extends InMemoryNotificationTransport {
  private barrier: Promise<void> | null = null;
  private releaseBarrier: (() => void) | null = null;

  override async send(input: Parameters<InMemoryNotificationTransport['send']>[0]) {
    if (this.barrier === null) {
      this.barrier = new Promise<void>((resolve) => {
        this.releaseBarrier = resolve;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      this.releaseBarrier?.();
    } else {
      this.releaseBarrier?.();
    }
    await this.barrier;
    return super.send(input);
  }
}
