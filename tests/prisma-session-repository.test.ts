import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySessionRepository, type LoginSession } from '../src/modules/auth-security/index.js';
import { PrismaSessionRepository, type PrismaSessionClient } from '../src/infrastructure/prisma/session-repository.js';

function session(input: { id: string; userId?: string; deviceFingerprintId?: string | null; status?: LoginSession['status']; issuedAt?: string; expiresAt?: string; idleExpiresAt?: string | null; lastSeenAt?: string | null; revokedAt?: string | null; revokedByUserId?: string | null; revocationReason?: string | null; metadata?: Record<string, unknown> }): LoginSession {
  return Object.freeze({
    id: input.id,
    userId: input.userId ?? 'user-1',
    deviceFingerprintId: input.deviceFingerprintId ?? null,
    status: input.status ?? 'active',
    issuedAt: input.issuedAt ?? '2026-07-09T00:00:01.000Z',
    expiresAt: input.expiresAt ?? '2026-07-10T00:00:01.000Z',
    idleExpiresAt: input.idleExpiresAt ?? '2026-07-09T01:00:01.000Z',
    lastSeenAt: input.lastSeenAt ?? '2026-07-09T00:00:01.000Z',
    revokedAt: input.revokedAt ?? null,
    revokedByUserId: input.revokedByUserId ?? null,
    revocationReason: input.revocationReason ?? null,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

class FakeSessionClient implements PrismaSessionClient {
  readonly records = new Map<string, {
    id: string;
    userId: string;
    deviceFingerprintId: string | null;
    status: LoginSession['status'];
    issuedAt: Date;
    expiresAt: Date;
    idleExpiresAt: Date | null;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    revokedByUserId: string | null;
    revocationReason: string | null;
    metadata: unknown;
  }>();

  readonly loginSession: PrismaSessionClient['loginSession'];

  constructor() {
    this.loginSession = {
      upsert: async ({ where, create, update }) => {
        const record = { ...(this.records.has(where.id) ? update : create) };
        this.records.set(where.id, record);
        return record;
      },
      findUnique: async ({ where }) => this.records.get(where.id) ?? null,
      findMany: async ({ where }) => [...this.records.values()]
        .filter((record) => Object.entries(where).every(([key, value]) => record[key as keyof typeof record] === value))
        .sort((left, right) => left.issuedAt.getTime() - right.issuedAt.getTime()),
    };
  }
}

test('PrismaSessionRepository saves and finds sessions with Date and metadata mapping', async () => {
  const client = new FakeSessionClient();
  const repository = new PrismaSessionRepository(client);
  const created = session({ id: 'session-1', deviceFingerprintId: 'device-1', metadata: { source: 'unit' } });

  const saved = await repository.save(created);
  const found = await repository.findById('session-1');

  assert.equal(saved.id, created.id);
  assert.equal(found?.id, created.id);
  assert.equal(found?.issuedAt, created.issuedAt);
  assert.equal(JSON.stringify(found?.metadata), JSON.stringify(created.metadata));
  assert.equal(client.records.get('session-1')?.issuedAt instanceof Date, true);
});

test('PrismaSessionRepository updates existing sessions through save', async () => {
  const client = new FakeSessionClient();
  const repository = new PrismaSessionRepository(client);
  await repository.save(session({ id: 'session-1', status: 'active' }));
  const revoked = session({ id: 'session-1', status: 'revoked', revokedAt: '2026-07-09T00:10:00.000Z', revokedByUserId: 'admin-1', revocationReason: 'manual' });

  const saved = await repository.save(revoked);

  assert.equal(saved.status, 'revoked');
  assert.equal(saved.revokedAt, '2026-07-09T00:10:00.000Z');
  assert.equal(client.records.size, 1);
});

test('PrismaSessionRepository lists only active sessions by user chronologically', async () => {
  const client = new FakeSessionClient();
  const repository = new PrismaSessionRepository(client);
  await repository.save(session({ id: 'session-2', userId: 'user-1', issuedAt: '2026-07-09T00:00:02.000Z' }));
  await repository.save(session({ id: 'revoked', userId: 'user-1', status: 'revoked', issuedAt: '2026-07-09T00:00:01.500Z' }));
  await repository.save(session({ id: 'other-user', userId: 'user-2', issuedAt: '2026-07-09T00:00:01.250Z' }));
  await repository.save(session({ id: 'session-1', userId: 'user-1', issuedAt: '2026-07-09T00:00:01.000Z' }));

  const sessions = await repository.listActiveByUserId('user-1');

  assert.equal(sessions.map((current) => current.id).join(','), 'session-1,session-2');
});

test('PrismaSessionRepository lists only active sessions by device', async () => {
  const client = new FakeSessionClient();
  const repository = new PrismaSessionRepository(client);
  await repository.save(session({ id: 'device-session', deviceFingerprintId: 'device-1' }));
  await repository.save(session({ id: 'revoked-device-session', deviceFingerprintId: 'device-1', status: 'revoked' }));
  await repository.save(session({ id: 'other-device-session', deviceFingerprintId: 'device-2' }));

  const sessions = await repository.listActiveByDeviceId('device-1');

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, 'device-session');
});

test('PrismaSessionRepository preserves SessionRepository behavior against in-memory repository', async () => {
  const memory = new InMemorySessionRepository();
  const client = new FakeSessionClient();
  const prisma = new PrismaSessionRepository(client);
  const active = session({ id: 'active-session', deviceFingerprintId: 'device-1' });
  const revoked = session({ id: 'revoked-session', deviceFingerprintId: 'device-1', status: 'revoked' });

  for (const current of [active, revoked]) {
    await memory.save(current);
    await prisma.save(current);
  }

  assert.equal(JSON.stringify(await prisma.findById('active-session')), JSON.stringify(await memory.findById('active-session')));
  assert.equal(JSON.stringify(await prisma.listActiveByUserId('user-1')), JSON.stringify(await memory.listActiveByUserId('user-1')));
  assert.equal(JSON.stringify(await prisma.listActiveByDeviceId('device-1')), JSON.stringify(await memory.listActiveByDeviceId('device-1')));
});
