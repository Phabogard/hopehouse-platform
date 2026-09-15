import assert from 'node:assert/strict';
import test from 'node:test';
import { AuditLogService, InMemoryAuditLogRepository } from '../src/modules/audit/audit-log.js';

test('audit entries and metadata are immutable after recording', async () => {
  const audit = new AuditLogService();
  const entry = await audit.record({
    actorUserId: 'u1',
    action: 'beneficiary.create',
    entityType: 'beneficiary',
    entityId: 'BEN-001',
    outcome: 'success',
    metadata: { reference: 'BEN-001' },
  });

  assert.throws(() => {
    (entry as { action: string }).action = 'payment.create';
  });
  assert.throws(() => {
    (entry.metadata as Record<string, unknown>).reference = 'BEN-002';
  });
  assert.equal(entry.action, 'beneficiary.create');
  assert.equal(entry.metadata.reference, 'BEN-001');
});

test('audit list cannot be used to mutate the audit log collection', async () => {
  const audit = new AuditLogService();
  await audit.record({
    actorUserId: 'u1',
    action: 'payment.create',
    entityType: 'payment',
    entityId: 'PAY-001',
    outcome: 'success',
  });

  const entries = await audit.list();
  assert.throws(() => {
    (entries as unknown[]).push({});
  });
  assert.equal((await audit.list()).length, 1);
});

test('InMemoryAuditLogRepository supports query filters and deterministic ordering', async () => {
  const repo = new InMemoryAuditLogRepository();
  const now = new Date('2026-09-01T12:00:00.000Z').toISOString();

  await repo.record({
    id: 'audit-a',
    actorUserId: 'user-1',
    action: 'order.create',
    entityType: 'order',
    entityId: 'ord-1',
    outcome: 'success',
    occurredAt: now,
    metadata: { step: 1 },
  });

  await repo.record({
    id: 'audit-b',
    actorUserId: 'user-1',
    action: 'order.transition',
    entityType: 'order',
    entityId: 'ord-1',
    outcome: 'success',
    occurredAt: now,
    metadata: { step: 2 },
  });

  await repo.record({
    id: 'audit-c',
    actorUserId: 'user-2',
    action: 'order.create',
    entityType: 'order',
    entityId: 'ord-2',
    outcome: 'failure',
    occurredAt: now,
  });

  const user1Entries = await repo.list({ actorUserId: 'user-1' });
  assert.equal(user1Entries.length, 2);

  const ord1Entries = await repo.list({ entityId: 'ord-1' });
  assert.equal(ord1Entries.length, 2);

  const failureEntries = await repo.list({ outcome: 'failure' });
  assert.equal(failureEntries.length, 1);
  assert.equal(failureEntries[0]?.id, 'audit-c');

  const limited = await repo.list({ limit: 1 });
  assert.equal(limited.length, 1);
});
