import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PostgresIdempotencyStore } from '../src/infrastructure/prisma/idempotency-store.js';

const databaseUrl = process.env.DATABASE_URL;

test('postgres idempotency store enforces duplicate safety under concurrent writes', { skip: databaseUrl === undefined }, async () => {
  const url = databaseUrl as string;
  const clientA = new PrismaClient({ datasources: { db: { url } } });
  const clientB = new PrismaClient({ datasources: { db: { url } } });
  const key = `integration:${randomUUID()}`;
  const operation = 'payment.webhook';

  try {
    const storeA = new PostgresIdempotencyStore(clientA);
    const storeB = new PostgresIdempotencyStore(clientB);

    await Promise.all([
      storeA.save({
        key,
        operation,
        resultReference: 'result-a',
        createdAt: '2026-08-20T10:00:00.000Z',
      }),
      storeB.save({
        key,
        operation,
        resultReference: 'result-b',
        createdAt: '2026-08-20T10:00:01.000Z',
      }),
    ]);

    const rows = await clientA.$queryRaw<Array<{ result_reference: string | null }>>`
      SELECT "result_reference"
      FROM "idempotency_records"
      WHERE "key" = ${key} AND "operation" = ${operation}
    `;

    assert.equal(rows.length, 1);
    assert.ok(rows[0]?.result_reference === 'result-a' || rows[0]?.result_reference === 'result-b');

    const persisted = await storeA.find(key, operation);
    assert.ok(persisted !== null);
    assert.equal(persisted.key, key);
    assert.equal(persisted.operation, operation);
  } finally {
    await clientA.$executeRaw`
      DELETE FROM "idempotency_records"
      WHERE "key" = ${key} AND "operation" = ${operation}
    `;
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
  }
});
