import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySecurityEventRepository, type SecurityEvent } from '../src/modules/auth-security/index.js';
import { PrismaSecurityEventRepository, type PrismaSecurityEventClient } from '../src/infrastructure/prisma/security-event-repository.js';

function event(input: { id: string; userId?: string | null; actorUserId?: string | null; occurredAt: string; metadata?: Record<string, unknown> }): SecurityEvent {
  return Object.freeze({
    id: input.id,
    userId: input.userId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: 'security.test',
    severity: 'info',
    relatedEntityType: 'test_entity',
    relatedEntityId: input.id,
    occurredAt: input.occurredAt,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

class FakeSecurityEventClient implements PrismaSecurityEventClient {
  readonly records: Array<{
    id: string;
    userId: string | null;
    actorUserId: string | null;
    eventType: SecurityEvent['eventType'];
    severity: SecurityEvent['severity'];
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    occurredAt: Date;
    metadata: unknown;
  }> = [];

  readonly securityEvent: PrismaSecurityEventClient['securityEvent'];

  constructor() {
    this.securityEvent = {
      create: async ({ data }) => {
        const record = { ...data };
        this.records.push(record);
        return record;
      },
      findMany: async ({ where }) => [...this.records]
        .filter((record) => Object.entries(where).every(([key, value]) => record[key as keyof typeof record] === value))
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()),
    };
  }
}

test('PrismaSecurityEventRepository records events append-only and maps metadata JSON', async () => {
  const client = new FakeSecurityEventClient();
  const repository = new PrismaSecurityEventRepository(client);
  const first = event({ id: 'event-1', userId: 'user-1', actorUserId: 'admin-1', occurredAt: '2026-07-09T00:00:02.000Z', metadata: { nested: { source: 'unit' } } });
  const second = event({ id: 'event-2', userId: 'user-1', actorUserId: 'admin-2', occurredAt: '2026-07-09T00:00:01.000Z', metadata: { reason: 'chronology' } });

  const saved = await repository.record(first);
  await repository.record(second);

  assert.equal(saved.id, first.id);
  assert.equal(saved.occurredAt, first.occurredAt);
  assert.equal(JSON.stringify(saved.metadata), JSON.stringify(first.metadata));
  assert.equal(client.records.length, 2);
});

test('PrismaSecurityEventRepository lists user events chronologically', async () => {
  const client = new FakeSecurityEventClient();
  const repository = new PrismaSecurityEventRepository(client);
  await repository.record(event({ id: 'event-2', userId: 'user-1', occurredAt: '2026-07-09T00:00:02.000Z' }));
  await repository.record(event({ id: 'event-other', userId: 'user-2', occurredAt: '2026-07-09T00:00:01.500Z' }));
  await repository.record(event({ id: 'event-1', userId: 'user-1', occurredAt: '2026-07-09T00:00:01.000Z' }));

  const events = await repository.listByUserId('user-1');

  assert.equal(events.map((securityEvent) => securityEvent.id).join(','), 'event-1,event-2');
});

test('PrismaSecurityEventRepository can list actor events without changing the domain service', async () => {
  const client = new FakeSecurityEventClient();
  const repository = new PrismaSecurityEventRepository(client);
  await repository.record(event({ id: 'event-1', userId: 'user-1', actorUserId: 'admin-1', occurredAt: '2026-07-09T00:00:01.000Z' }));
  await repository.record(event({ id: 'event-2', userId: 'user-2', actorUserId: 'admin-2', occurredAt: '2026-07-09T00:00:02.000Z' }));

  const events = await repository.listByActorUserId('admin-1');

  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, 'event-1');
});

test('PrismaSecurityEventRepository preserves SecurityEventRepository behavior for user listing', async () => {
  const memory = new InMemorySecurityEventRepository();
  const client = new FakeSecurityEventClient();
  const prisma = new PrismaSecurityEventRepository(client);
  const recorded = event({ id: 'event-1', userId: 'user-1', occurredAt: '2026-07-09T00:00:01.000Z' });

  await memory.record(recorded);
  await prisma.record(recorded);

  assert.equal(JSON.stringify(await prisma.listByUserId('user-1')), JSON.stringify(await memory.listByUserId('user-1')));
});
