import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresIdempotencyStore, type PrismaIdempotencyClient } from '../src/infrastructure/prisma/idempotency-store.js';

test('postgres idempotency store maps persisted records', async () => {
  const calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  const client: PrismaIdempotencyClient = {
    async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> {
      calls.push({ sql: Array.from(strings).join('?'), values });
      return [
        {
          key: 'stripe:event-1',
          operation: 'payment.webhook',
          result_reference: 'payment-1',
          created_at: new Date('2026-08-20T10:00:00.000Z'),
        },
      ] as T;
    },
  };

  const store = new PostgresIdempotencyStore(client);
  const record = await store.find('stripe:event-1', 'payment.webhook');

  assert.deepEqual(record, {
    key: 'stripe:event-1',
    operation: 'payment.webhook',
    resultReference: 'payment-1',
    createdAt: '2026-08-20T10:00:00.000Z',
  });
  assert.match(calls[0]?.sql ?? '', /SELECT/);
  assert.deepEqual(calls[0]?.values, ['stripe:event-1', 'payment.webhook']);
});

test('postgres idempotency store save() returns true when it actually inserted the row', async () => {
  const calls: Array<{ readonly sql: string; readonly values: readonly unknown[] }> = [];
  const client: PrismaIdempotencyClient = {
    async $queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<T> {
      calls.push({ sql: Array.from(strings).join('?'), values });
      return [{ key: 'stripe:event-1' }] as T; // RETURNING produced a row: this call won
    },
  };

  const store = new PostgresIdempotencyStore(client);
  const won = await store.save({
    key: 'stripe:event-1',
    operation: 'payment.webhook',
    resultReference: 'payment-1',
    createdAt: '2026-08-20T10:00:00.000Z',
  });

  assert.equal(won, true);
  assert.match(calls[0]?.sql ?? '', /INSERT INTO/);
  assert.match(calls[0]?.sql ?? '', /ON CONFLICT \("key", "operation"\) DO NOTHING/);
  assert.match(calls[0]?.sql ?? '', /RETURNING "key"/);
  assert.deepEqual(calls[0]?.values, [
    'stripe:event-1',
    'payment.webhook',
    'payment-1',
    new Date('2026-08-20T10:00:00.000Z'),
  ]);
});

test('postgres idempotency store save() returns false when a record already existed (no row returned)', async () => {
  const client: PrismaIdempotencyClient = {
    async $queryRaw<T = unknown>(): Promise<T> {
      return [] as T; // ON CONFLICT DO NOTHING: no row returned, this call lost
    },
  };

  const store = new PostgresIdempotencyStore(client);
  const won = await store.save({
    key: 'stripe:event-1',
    operation: 'payment.webhook',
    resultReference: 'payment-1',
    createdAt: '2026-08-20T10:00:00.000Z',
  });

  assert.equal(won, false);
});

test('postgres idempotency store rejects invalid creation timestamps before writing', async () => {
  let queryCount = 0;
  const client: PrismaIdempotencyClient = {
    async $queryRaw<T = unknown>(): Promise<T> {
      queryCount += 1;
      return [] as T;
    },
  };

  const store = new PostgresIdempotencyStore(client);
  await assert.rejects(
    store.save({
      key: 'stripe:event-1',
      operation: 'payment.webhook',
      createdAt: 'not-a-date',
    }),
    /Invalid idempotency record creation date/,
  );
  assert.equal(queryCount, 0);
});
