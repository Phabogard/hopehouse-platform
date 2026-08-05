import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryLoginAttemptRepository, type LoginAttempt } from '../src/modules/auth-security/index.js';
import { PrismaLoginAttemptRepository, type PrismaLoginAttemptClient } from '../src/infrastructure/prisma/login-attempt-repository.js';

function attempt(input: { id: string; identifierHash?: string; outcome?: LoginAttempt['outcome']; occurredAt: string; userId?: string | null; deviceFingerprintId?: string | null; ipAddressHash?: string | null; failureReason?: string | null; metadata?: Record<string, unknown> }): LoginAttempt {
  return Object.freeze({
    id: input.id,
    userId: input.userId ?? null,
    identifierHash: input.identifierHash ?? 'hash:identifier',
    deviceFingerprintId: input.deviceFingerprintId ?? null,
    ipAddressHash: input.ipAddressHash ?? null,
    outcome: input.outcome ?? 'failed',
    failureReason: input.failureReason ?? (input.outcome === 'succeeded' ? null : 'invalid_credentials'),
    occurredAt: input.occurredAt,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

class FakeLoginAttemptClient implements PrismaLoginAttemptClient {
  readonly records: Array<{
    id: string;
    userId: string | null;
    identifierHash: string;
    deviceFingerprintId: string | null;
    ipAddressHash: string | null;
    outcome: LoginAttempt['outcome'];
    failureReason: string | null;
    occurredAt: Date;
    metadata: unknown;
  }> = [];

  readonly loginAttempt: PrismaLoginAttemptClient['loginAttempt'];

  constructor() {
    this.loginAttempt = {
      create: async ({ data }) => {
        const record = { ...data };
        this.records.push(record);
        return record;
      },
      count: async ({ where }) => this.records.filter((record) => record.identifierHash === where.identifierHash
        && record.outcome === where.outcome
        && record.occurredAt >= where.occurredAt.gte
        && record.occurredAt <= where.occurredAt.lte).length,
    };
  }
}

test('PrismaLoginAttemptRepository records attempts and maps Date and metadata JSON', async () => {
  const client = new FakeLoginAttemptClient();
  const repository = new PrismaLoginAttemptRepository(client);
  const recorded = attempt({ id: 'attempt-1', occurredAt: '2026-07-09T00:00:01.000Z', userId: 'user-1', deviceFingerprintId: 'device-1', ipAddressHash: 'hash:ip', metadata: { platform: 'test' } });

  const saved = await repository.record(recorded);

  assert.equal(saved.id, recorded.id);
  assert.equal(saved.occurredAt, recorded.occurredAt);
  assert.equal(JSON.stringify(saved.metadata), JSON.stringify(recorded.metadata));
  assert.equal(client.records[0]?.occurredAt instanceof Date, true);
});

test('PrismaLoginAttemptRepository counts only recent failed attempts for the identifier hash', async () => {
  const client = new FakeLoginAttemptClient();
  const repository = new PrismaLoginAttemptRepository(client);
  await repository.record(attempt({ id: 'old-failure', occurredAt: '2026-07-08T23:59:59.000Z' }));
  await repository.record(attempt({ id: 'recent-failure', occurredAt: '2026-07-09T00:00:02.000Z' }));
  await repository.record(attempt({ id: 'other-identifier', identifierHash: 'hash:other', occurredAt: '2026-07-09T00:00:03.000Z' }));
  await repository.record(attempt({ id: 'success', outcome: 'succeeded', occurredAt: '2026-07-09T00:00:04.000Z' }));
  await repository.record(attempt({ id: 'blocked', outcome: 'blocked', occurredAt: '2026-07-09T00:00:05.000Z' }));

  const failures = await repository.countRecentFailures({ identifierHash: 'hash:identifier', since: '2026-07-09T00:00:00.000Z', now: '2026-07-09T00:00:10.000Z' });

  assert.equal(failures, 1);
});

test('PrismaLoginAttemptRepository preserves LoginAttemptRepository count behavior against in-memory repository', async () => {
  const memory = new InMemoryLoginAttemptRepository();
  const client = new FakeLoginAttemptClient();
  const prisma = new PrismaLoginAttemptRepository(client);
  const attempts = [
    attempt({ id: 'failure-1', occurredAt: '2026-07-09T00:00:01.000Z' }),
    attempt({ id: 'failure-2', occurredAt: '2026-07-09T00:00:02.000Z' }),
    attempt({ id: 'success', outcome: 'succeeded', occurredAt: '2026-07-09T00:00:03.000Z' }),
  ];

  for (const current of attempts) {
    await memory.record(current);
    await prisma.record(current);
  }

  const input = { identifierHash: 'hash:identifier', since: '2026-07-09T00:00:00.000Z', now: '2026-07-09T00:00:10.000Z' };
  assert.equal(await prisma.countRecentFailures(input), await memory.countRecentFailures(input));
});
