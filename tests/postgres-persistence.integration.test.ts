import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuditLogService } from '../src/modules/audit/audit-log.js';
import { PostgresOutboxStore } from '../src/infrastructure/outbox/postgres-outbox-store.js';
import { PrismaAuditLogRepository } from '../src/infrastructure/prisma/audit-log-repository.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

test('postgres audit repository persists and reloads AuditLogService entries', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  let entryId: string | undefined;
  const audit = new AuditLogService(new PrismaAuditLogRepository({
    auditLog: {
      create: async ({ data }) => client.auditLog.create({
        data: { ...data, metadata: data.metadata as Prisma.InputJsonValue },
      }).then((record) => ({ ...record, outcome: record.outcome as 'success' | 'failure' })),
      findMany: async ({ orderBy }) => (await client.auditLog.findMany({ orderBy }))
        .map((record) => ({ ...record, outcome: record.outcome as 'success' | 'failure' })),
    },
  }));

  try {
    const entry = await audit.record({
      actorUserId: null,
      action: 'integration.audit.persist',
      entityType: 'integration_test',
      entityId: randomUUID(),
      outcome: 'success',
      metadata: { source: 'postgres-integration' },
    });
    entryId = entry.id;

    const persisted = await client.auditLog.findUnique({ where: { id: entry.id } });
    assert.ok(persisted !== null);
    assert.equal(persisted.action, entry.action);
    assert.deepEqual(persisted.metadata, { source: 'postgres-integration' });

    const entries = await audit.list();
    assert.deepEqual(entries.find((candidate) => candidate.id === entry.id), entry);
  } finally {
    if (entryId !== undefined) await client.auditLog.deleteMany({ where: { id: entryId } });
    await client.$disconnect();
  }
});

test('postgres outbox persists, leases, retries, and publishes messages', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const store = new PostgresOutboxStore<{ amount: number }>(client);
  const eventId = `integration-outbox-${randomUUID()}`;
  const occurredAt = new Date('2026-08-28T10:00:00.000Z');
  const retryAt = new Date('2026-08-28T10:01:00.000Z');
  const publishedAt = new Date('2026-08-28T10:02:00.000Z');

  try {
    await store.append({
      eventId,
      eventType: 'IntegrationOutboxCreated',
      schemaVersion: 1,
      occurredAt: occurredAt.toISOString(),
      correlationId: `correlation-${eventId}`,
      causationId: null,
      aggregateId: 'aggregate-1',
      aggregateType: 'IntegrationTest',
      payload: { amount: 500 },
    });

    const inserted = await client.outboxMessage.findUnique({ where: { id: eventId } });
    assert.ok(inserted !== null);
    assert.deepEqual(inserted.payloadJson, { amount: 500 });
    assert.equal(inserted.availableAt.toISOString(), occurredAt.toISOString());

    const firstClaim = await store.claimBatch(1, occurredAt, 'worker-a', 30_000);
    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0]?.eventId, eventId);
    assert.equal(firstClaim[0]?.leaseOwner, 'worker-a');
    assert.equal(firstClaim[0]?.attempts, 0);

    const secondClaim = await store.claimBatch(1, occurredAt, 'worker-b', 30_000);
    assert.deepEqual(secondClaim, []);

    await store.markFailed(eventId, 'worker-a', new Error('temporary transport failure'), retryAt);
    const failed = await client.outboxMessage.findUniqueOrThrow({ where: { id: eventId } });
    assert.equal(failed.attempts, 1);
    assert.equal(failed.availableAt.toISOString(), retryAt.toISOString());
    assert.equal(failed.lastError, 'temporary transport failure');
    assert.equal(failed.leaseOwner, null);
    assert.equal(failed.leaseUntil, null);

    const retryClaim = await store.claimBatch(1, retryAt, 'worker-b', 30_000);
    assert.equal(retryClaim.length, 1);
    assert.equal(retryClaim[0]?.leaseOwner, 'worker-b');
    assert.equal(retryClaim[0]?.attempts, 1);

    await store.markPublished(eventId, 'worker-b', publishedAt);
    const published = await client.outboxMessage.findUniqueOrThrow({ where: { id: eventId } });
    assert.equal(published.publishedAt?.toISOString(), publishedAt.toISOString());
    assert.equal(published.lastError, null);
    assert.equal(published.leaseOwner, null);
    assert.equal(published.leaseUntil, null);
    assert.deepEqual(await store.claimBatch(1, publishedAt, 'worker-c', 30_000), []);
  } finally {
    await client.outboxMessage.deleteMany({ where: { id: eventId } });
    await client.$disconnect();
  }
});

test('postgres outbox skips rows locked by another transaction', { skip: databaseUrl === undefined }, async () => {
  const clientA = integrationClient();
  const clientB = integrationClient();
  const store = new PostgresOutboxStore(clientB);
  const eventId = `integration-outbox-locked-${randomUUID()}`;
  const now = new Date('2026-08-28T11:00:00.000Z');

  try {
    await new PostgresOutboxStore(clientA).append({
      eventId,
      eventType: 'IntegrationOutboxLocked',
      schemaVersion: 1,
      occurredAt: now.toISOString(),
      correlationId: `correlation-${eventId}`,
      causationId: null,
      aggregateId: 'aggregate-locked',
      aggregateType: 'IntegrationTest',
      payload: {},
    });

    await clientA.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM outbox_messages
        WHERE id = ${eventId}
        FOR UPDATE
      `;

      const claims = await store.claimBatch(1, now, 'worker-b', 30_000);
      assert.deepEqual(claims, []);
    });

    const claimsAfterLockRelease = await store.claimBatch(1, now, 'worker-b', 30_000);
    assert.equal(claimsAfterLockRelease.length, 1);
    assert.equal(claimsAfterLockRelease[0]?.eventId, eventId);
  } finally {
    await clientA.outboxMessage.deleteMany({ where: { id: eventId } });
    await Promise.all([clientA.$disconnect(), clientB.$disconnect()]);
  }
});
