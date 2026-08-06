import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRefreshTokenRepository, type SessionRefreshToken } from '../src/modules/auth-security/index.js';
import { PrismaRefreshTokenRepository, type PrismaRefreshTokenClient } from '../src/infrastructure/prisma/refresh-token-repository.js';

function refreshToken(input: { id?: string; sessionId?: string; tokenHash?: string; status?: SessionRefreshToken['status']; issuedAt?: string; expiresAt?: string; rotatedAt?: string | null; revokedAt?: string | null; replacedByTokenId?: string | null; metadata?: Record<string, unknown> } = {}): SessionRefreshToken {
  return Object.freeze({
    id: input.id ?? 'token-1',
    sessionId: input.sessionId ?? 'session-1',
    tokenHash: input.tokenHash ?? 'hash:token-1',
    status: input.status ?? 'active',
    issuedAt: input.issuedAt ?? '2026-07-09T00:00:00.000Z',
    expiresAt: input.expiresAt ?? '2026-07-10T00:00:00.000Z',
    rotatedAt: input.rotatedAt ?? null,
    revokedAt: input.revokedAt ?? null,
    replacedByTokenId: input.replacedByTokenId ?? null,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

type FakeRefreshTokenRecord = {
  id: string;
  sessionId: string;
  tokenHash: string;
  status: SessionRefreshToken['status'];
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
  metadata: unknown;
};

class FakeRefreshTokenClient implements PrismaRefreshTokenClient {
  readonly records = new Map<string, FakeRefreshTokenRecord>();
  transactionCount = 0;

  readonly sessionRefreshToken: PrismaRefreshTokenClient['sessionRefreshToken'];

  constructor(records: readonly SessionRefreshToken[] = []) {
    for (const record of records) this.records.set(record.id, this.toRecord(record));
    this.sessionRefreshToken = {
      upsert: async ({ where, create, update }) => {
        const existing = this.records.get(where.id);
        const record = existing === undefined ? { ...create } : { ...existing, ...update };
        this.records.set(where.id, record);
        return record;
      },
      findUnique: async ({ where }) => {
        if ('id' in where) return this.records.get(where.id) ?? null;
        return [...this.records.values()].find((record) => record.tokenHash === where.tokenHash) ?? null;
      },
      update: async ({ where, data }) => {
        const existing = this.records.get(where.id);
        if (existing === undefined) throw new Error('Record not found');
        const record = { ...existing, ...data };
        this.records.set(where.id, record);
        return record;
      },
      updateMany: async ({ where, data }) => {
        const existing = this.records.get(where.id);
        if (existing === undefined || existing.status !== where.status) return { count: 0 };
        this.records.set(where.id, { ...existing, ...data });
        return { count: 1 };
      },
      create: async ({ data }) => {
        const record = { ...data };
        this.records.set(record.id, record);
        return record;
      },
    };
  }

  async $transaction<T>(operation: (transaction: { readonly sessionRefreshToken: PrismaRefreshTokenClient['sessionRefreshToken'] }) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return operation({ sessionRefreshToken: this.sessionRefreshToken });
  }

  private toRecord(token: SessionRefreshToken): FakeRefreshTokenRecord {
    return {
      id: token.id,
      sessionId: token.sessionId,
      tokenHash: token.tokenHash,
      status: token.status,
      issuedAt: new Date(token.issuedAt),
      expiresAt: new Date(token.expiresAt),
      rotatedAt: token.rotatedAt === null ? null : new Date(token.rotatedAt),
      revokedAt: token.revokedAt === null ? null : new Date(token.revokedAt),
      replacedByTokenId: token.replacedByTokenId,
      metadata: token.metadata,
    };
  }
}

test('PrismaRefreshTokenRepository saves tokens with Date and metadata mapping', async () => {
  const client = new FakeRefreshTokenClient();
  const repository = new PrismaRefreshTokenRepository(client);
  const token = refreshToken({ metadata: { source: 'unit' } });

  const saved = await repository.save(token);
  const record = client.records.get('token-1');

  assert.equal(saved.id, token.id);
  assert.equal(saved.issuedAt, token.issuedAt);
  assert.equal(JSON.stringify(saved.metadata), JSON.stringify(token.metadata));
  assert.equal(record?.issuedAt instanceof Date, true);
});

test('PrismaRefreshTokenRepository finds tokens by hash', async () => {
  const repository = new PrismaRefreshTokenRepository(new FakeRefreshTokenClient([refreshToken({ tokenHash: 'hash:known' })]));

  const found = await repository.findByHash('hash:known');
  const missing = await repository.findByHash('hash:missing');

  assert.equal(found?.tokenHash, 'hash:known');
  assert.equal(missing, null);
});

test('PrismaRefreshTokenRepository rotates an active token transactionally', async () => {
  const client = new FakeRefreshTokenClient([refreshToken({ id: 'token-1', tokenHash: 'hash:old' })]);
  const repository = new PrismaRefreshTokenRepository(client);
  const nextToken = refreshToken({ id: 'token-2', tokenHash: 'hash:new', issuedAt: '2026-07-09T00:05:00.000Z' });

  const rotated = await repository.rotateActive({ tokenHash: 'hash:old', rotatedAt: '2026-07-09T00:05:00.000Z', nextToken });
  const previousRecord = client.records.get('token-1');

  assert.equal(client.transactionCount, 1);
  assert.equal(rotated?.previous.status, 'rotated');
  assert.equal(rotated?.previous.rotatedAt, '2026-07-09T00:05:00.000Z');
  assert.equal(rotated?.previous.replacedByTokenId, 'token-2');
  assert.equal(rotated?.next.id, 'token-2');
  assert.equal(previousRecord?.status, 'rotated');
  assert.equal(previousRecord?.rotatedAt?.toISOString(), '2026-07-09T00:05:00.000Z');
  assert.equal(previousRecord?.replacedByTokenId, 'token-2');
});

test('PrismaRefreshTokenRepository returns null when rotating a non-active token', async () => {
  const repository = new PrismaRefreshTokenRepository(new FakeRefreshTokenClient([
    refreshToken({ id: 'rotated', tokenHash: 'hash:rotated', status: 'rotated' }),
    refreshToken({ id: 'revoked', tokenHash: 'hash:revoked', status: 'revoked' }),
  ]));

  const rotated = await repository.rotateActive({ tokenHash: 'hash:rotated', rotatedAt: '2026-07-09T00:05:00.000Z', nextToken: refreshToken({ id: 'next-1', tokenHash: 'hash:next-1' }) });
  const revoked = await repository.rotateActive({ tokenHash: 'hash:revoked', rotatedAt: '2026-07-09T00:05:00.000Z', nextToken: refreshToken({ id: 'next-2', tokenHash: 'hash:next-2' }) });

  assert.equal(rotated, null);
  assert.equal(revoked, null);
});

test('PrismaRefreshTokenRepository allows only one concurrent active rotation winner', async () => {
  const client = new FakeRefreshTokenClient([refreshToken({ id: 'token-1', tokenHash: 'hash:old' })]);
  const repository = new PrismaRefreshTokenRepository(client);
  const firstNext = refreshToken({ id: 'token-2', tokenHash: 'hash:new-1' });
  const secondNext = refreshToken({ id: 'token-3', tokenHash: 'hash:new-2' });

  const results = await Promise.all([
    repository.rotateActive({ tokenHash: 'hash:old', rotatedAt: '2026-07-09T00:05:00.000Z', nextToken: firstNext }),
    repository.rotateActive({ tokenHash: 'hash:old', rotatedAt: '2026-07-09T00:05:01.000Z', nextToken: secondNext }),
  ]);

  assert.equal(results.filter((result) => result !== null).length, 1);
  assert.equal(results.filter((result) => result === null).length, 1);
  assert.equal([...client.records.values()].filter((record) => record.id === 'token-2' || record.id === 'token-3').length, 1);
});

test('PrismaRefreshTokenRepository marks existing tokens as reused', async () => {
  const client = new FakeRefreshTokenClient([refreshToken({ id: 'token-1', tokenHash: 'hash:old', status: 'rotated' })]);
  const repository = new PrismaRefreshTokenRepository(client);

  const reused = await repository.markReused({ tokenHash: 'hash:old', reusedAt: '2026-07-09T00:06:00.000Z' });
  const missing = await repository.markReused({ tokenHash: 'hash:missing', reusedAt: '2026-07-09T00:06:00.000Z' });

  assert.equal(reused?.status, 'reused');
  assert.equal(reused?.revokedAt, '2026-07-09T00:06:00.000Z');
  assert.equal(client.records.get('token-1')?.revokedAt?.toISOString(), '2026-07-09T00:06:00.000Z');
  assert.equal(missing, null);
});

test('PrismaRefreshTokenRepository preserves RefreshTokenRepository behavior against in-memory repository', async () => {
  const memory = new InMemoryRefreshTokenRepository();
  const prisma = new PrismaRefreshTokenRepository(new FakeRefreshTokenClient());
  const token = refreshToken({ id: 'token-1', tokenHash: 'hash:old', metadata: { source: 'parity' } });
  const nextToken = refreshToken({ id: 'token-2', tokenHash: 'hash:new' });

  await memory.save(token);
  await prisma.save(token);
  assert.equal(JSON.stringify(await prisma.findByHash('hash:old')), JSON.stringify(await memory.findByHash('hash:old')));

  const memoryRotated = await memory.rotateActive({ tokenHash: 'hash:old', rotatedAt: '2026-07-09T00:07:00.000Z', nextToken });
  const prismaRotated = await prisma.rotateActive({ tokenHash: 'hash:old', rotatedAt: '2026-07-09T00:07:00.000Z', nextToken });
  assert.equal(JSON.stringify(prismaRotated), JSON.stringify(memoryRotated));

  const memoryReused = await memory.markReused({ tokenHash: 'hash:old', reusedAt: '2026-07-09T00:08:00.000Z' });
  const prismaReused = await prisma.markReused({ tokenHash: 'hash:old', reusedAt: '2026-07-09T00:08:00.000Z' });
  assert.equal(JSON.stringify(prismaReused), JSON.stringify(memoryReused));
});
