import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PostgresOutboxStore } from '../src/infrastructure/outbox/postgres-outbox-store.js';
import { PostgresIdempotencyStore } from '../src/infrastructure/prisma/idempotency-store.js';
import { RechargeNotificationConsumer } from '../src/modules/notifications/recharge-notification-consumer.js';
import { OutboxNotificationPublisher } from '../src/modules/notifications/outbox-notification-publisher.js';
import { InMemoryNotificationTransport } from '../src/modules/notifications/notification-transport.js';
import { OutboxRelay } from '../src/core/outbox/outbox.js';

const databaseUrl = process.env.DATABASE_URL;

function client(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

test('recharge notification integration: OutboxRelay processes wallet.recharge_notification_requested event with PostgreSQL idempotency', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const eventId = `EVT-PG-NOTIF-${randomUUID()}`;
  const attemptId = `ATT-${randomUUID()}`;
  const walletId = `WAL-${randomUUID()}`;

  try {
    const outboxStore = new PostgresOutboxStore(db);
    const idempotencyStore = new PostgresIdempotencyStore(db);
    const transport = new InMemoryNotificationTransport();
    const consumer = new RechargeNotificationConsumer(transport, idempotencyStore);
    const publisher = new OutboxNotificationPublisher(consumer);
    const relay = new OutboxRelay(outboxStore, publisher, { workerId: 'worker-notif-1', batchSize: 50 });

    // Append event to PostgreSQL outbox
    await outboxStore.append({
      eventId,
      eventType: 'wallet.recharge_notification_requested',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: attemptId,
      causationId: null,
      aggregateId: walletId,
      aggregateType: 'wallet',
      payload: {
        rechargeAttemptId: attemptId,
        walletId,
        orderId: `ORD-${randomUUID()}`,
        receiptId: `REC-${randomUUID()}`,
        receiptNumber: `RCH-${attemptId}`,
        amountCents: 15_000,
        currency: 'USD',
        type: 'recharge_confirmed',
      },
    });

    // 1. Process outbox batch
    const processedCount = await relay.processBatch();
    assert.ok(processedCount >= 1);

    const sentNotif = transport.sent.find((s) => s.recipientId === walletId);
    assert.ok(sentNotif !== undefined);
    assert.equal(sentNotif.recipientId, walletId);
    assert.equal(sentNotif.template, 'recharge_confirmed');

    // Verify outbox message is marked published in PostgreSQL
    const msg = await db.outboxMessage.findUnique({ where: { id: eventId } });
    assert.ok(msg?.publishedAt !== null);

    // Verify idempotency record saved in PostgreSQL
    const record = await idempotencyStore.find(`notification:${eventId}`, 'notification.recharge_confirmed');
    assert.ok(record !== null);

    // 2. Redeliver same event manually to consumer to verify idempotency store in PostgreSQL prevents duplicate notification
    const countBefore = transport.sent.length;
    const redeliveryResult = await consumer.handle({
      eventId,
      eventType: 'wallet.recharge_notification_requested',
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId: attemptId,
      causationId: null,
      aggregateId: walletId,
      aggregateType: 'wallet',
      payload: {
        rechargeAttemptId: attemptId,
        walletId,
        orderId: `ORD-${randomUUID()}`,
        receiptId: `REC-${randomUUID()}`,
        receiptNumber: `RCH-${attemptId}`,
        amountCents: 15_000,
        currency: 'USD',
        type: 'recharge_confirmed',
      },
    });

    assert.equal(redeliveryResult.processed, true);
    assert.equal(redeliveryResult.notification, undefined);
    assert.equal(transport.sent.length, countBefore, 'No duplicate notification sent upon redelivery');
  } finally {
    await db.outboxMessage.deleteMany({ where: { id: eventId } });
    await db.$executeRaw`DELETE FROM idempotency_records WHERE key = ${`notification:${eventId}`}`;
    await db.$disconnect();
  }
});
