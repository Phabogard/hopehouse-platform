import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaAuditLogRepository, type PrismaAuditLogDelegate } from '../src/infrastructure/prisma/audit-log-repository.js';

test('prisma audit repository maps records and preserves immutable metadata', async () => {
  const delegate: PrismaAuditLogDelegate = {
    async create({ data }) {
      return {
        ...data,
        occurredAt: data.occurredAt,
        metadata: data.metadata,
      };
    },
    async findMany() {
      return [];
    },
  };

  const repository = new PrismaAuditLogRepository({ auditLog: delegate });
  const entry = await repository.record({
    id: 'audit-1',
    actorUserId: 'user-1',
    action: 'payment.create',
    entityType: 'payment',
    entityId: 'pay-1',
    outcome: 'success',
    occurredAt: '2026-08-16T10:00:00.000Z',
    metadata: { amountCents: 1000 },
  });

  assert.equal(entry.id, 'audit-1');
  assert.equal(entry.occurredAt, '2026-08-16T10:00:00.000Z');
  assert.equal(entry.metadata.amountCents, 1000);
  assert.throws(() => {
    (entry.metadata as Record<string, unknown>).amountCents = 2000;
  });
});
