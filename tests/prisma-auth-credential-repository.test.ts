import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAuthCredentialRepository, type AuthCredential } from '../src/modules/auth-security/index.js';
import { PrismaAuthCredentialRepository, type PrismaAuthCredentialClient } from '../src/infrastructure/prisma/auth-credential-repository.js';

function authCredential(input: { id?: string; userId?: string; credentialType?: string; credentialHash?: string; status?: AuthCredential['status']; lastChangedAt?: string; mustRotateAt?: string | null; createdAt?: string; updatedAt?: string; metadata?: Record<string, unknown> } = {}): AuthCredential & { createdAt: string; updatedAt: string } {
  const lastChangedAt = input.lastChangedAt ?? '2026-07-09T00:00:00.000Z';
  return Object.freeze({
    id: input.id ?? 'credential-1',
    userId: input.userId ?? 'user-1',
    credentialType: input.credentialType ?? 'password',
    credentialHash: input.credentialHash ?? 'hash:password',
    status: input.status ?? 'active',
    lastChangedAt,
    mustRotateAt: input.mustRotateAt ?? null,
    createdAt: input.createdAt ?? lastChangedAt,
    updatedAt: input.updatedAt ?? lastChangedAt,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

type FakeAuthCredentialRecord = {
  id: string;
  userId: string;
  credentialType: string;
  credentialHash: string;
  status: AuthCredential['status'];
  lastChangedAt: Date;
  mustRotateAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
};

class FakeAuthCredentialClient implements PrismaAuthCredentialClient {
  readonly records = new Map<string, FakeAuthCredentialRecord>();
  transactionCount = 0;

  readonly authCredential: PrismaAuthCredentialClient['authCredential'];

  constructor(records: readonly ReturnType<typeof authCredential>[] = []) {
    for (const record of records) this.records.set(record.id, this.toRecord(record));
    this.authCredential = {
      findFirst: async ({ where }) => [...this.records.values()]
        .filter((record) => record.userId === where.userId && record.credentialType === where.credentialType && record.status === where.status)
        .sort((left, right) => right.lastChangedAt.getTime() - left.lastChangedAt.getTime())[0] ?? null,
      findMany: async ({ where }) => [...this.records.values()]
        .filter((record) => record.userId === where.userId && record.credentialType === where.credentialType && record.status === where.status),
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const id of where.id.in) {
          const record = this.records.get(id);
          if (record === undefined || record.status !== where.status) continue;
          this.records.set(id, { ...record, ...data });
          count += 1;
        }
        return { count };
      },
      create: async ({ data }) => {
        const record = { ...data };
        this.records.set(record.id, record);
        return record;
      },
    };
  }

  async $transaction<T>(operation: (transaction: { readonly authCredential: PrismaAuthCredentialClient['authCredential'] }) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return operation({ authCredential: this.authCredential });
  }

  private toRecord(record: ReturnType<typeof authCredential>): FakeAuthCredentialRecord {
    return {
      id: record.id,
      userId: record.userId,
      credentialType: record.credentialType,
      credentialHash: record.credentialHash,
      status: record.status,
      lastChangedAt: new Date(record.lastChangedAt),
      mustRotateAt: record.mustRotateAt === null ? null : new Date(record.mustRotateAt),
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
      metadata: record.metadata,
    };
  }
}

test('PrismaAuthCredentialRepository retrieves the active password credential', async () => {
  const repository = new PrismaAuthCredentialRepository(new FakeAuthCredentialClient([
    authCredential({ id: 'credential-1', credentialHash: 'hash:old', lastChangedAt: '2026-07-09T00:00:00.000Z' }),
    authCredential({ id: 'credential-2', credentialHash: 'hash:new', lastChangedAt: '2026-07-09T00:01:00.000Z', metadata: { source: 'unit' } }),
  ]));

  const credential = await repository.findActivePasswordCredentialByUserId('user-1');

  assert.equal(credential?.id, 'credential-2');
  assert.equal(credential?.credentialHash, 'hash:new');
  assert.equal(JSON.stringify(credential?.metadata), JSON.stringify({ source: 'unit' }));
});

test('PrismaAuthCredentialRepository ignores inactive, archived, rotated, disabled, and non-password credentials', async () => {
  const repository = new PrismaAuthCredentialRepository(new FakeAuthCredentialClient([
    authCredential({ id: 'rotated', status: 'rotated' }),
    authCredential({ id: 'disabled', status: 'disabled' }),
    authCredential({ id: 'archived', status: 'archived' }),
    authCredential({ id: 'totp', credentialType: 'totp', status: 'active' }),
  ]));

  const credential = await repository.findActivePasswordCredentialByUserId('user-1');

  assert.equal(credential, null);
});

test('PrismaAuthCredentialRepository replaces password credentials transactionally', async () => {
  const client = new FakeAuthCredentialClient([
    authCredential({ id: 'active-1', credentialHash: 'hash:old-1', status: 'active' }),
    authCredential({ id: 'active-2', credentialHash: 'hash:old-2', status: 'active' }),
    authCredential({ id: 'rotated', credentialHash: 'hash:rotated', status: 'rotated' }),
  ]);
  const repository = new PrismaAuthCredentialRepository(client);

  const created = await repository.replacePasswordCredential({ userId: 'user-1', credentialHash: 'hash:new', changedAt: '2026-07-09T00:10:00.000Z', metadata: { reason: 'reset' } });
  const activeCredentials = [...client.records.values()].filter((record) => record.userId === 'user-1' && record.credentialType === 'password' && record.status === 'active');
  const rotatedCredentials = [...client.records.values()].filter((record) => ['active-1', 'active-2'].includes(record.id));

  assert.equal(client.transactionCount, 1);
  assert.equal(created.credentialType, 'password');
  assert.equal(created.credentialHash, 'hash:new');
  assert.equal(created.status, 'active');
  assert.equal(created.lastChangedAt, '2026-07-09T00:10:00.000Z');
  assert.equal(JSON.stringify(created.metadata), JSON.stringify({ reason: 'reset' }));
  assert.equal(activeCredentials.length, 1);
  assert.equal(activeCredentials[0]?.id, created.id);
  assert.equal(rotatedCredentials.every((record) => record.status === 'rotated'), true);
  assert.equal(rotatedCredentials.every((record) => record.lastChangedAt.toISOString() === '2026-07-09T00:10:00.000Z'), true);
  assert.equal(rotatedCredentials.every((record) => record.updatedAt.toISOString() === '2026-07-09T00:10:00.000Z'), true);
});


test('PrismaAuthCredentialRepository does not create a new active credential when rotation loses a concurrent race', async () => {
  const client = new FakeAuthCredentialClient([authCredential({ id: 'active-1', status: 'active' })]);
  const originalUpdateMany = client.authCredential.updateMany;
  let attemptedCreate = false;
  client.authCredential.updateMany = async (input) => {
    const existing = client.records.get('active-1');
    if (existing !== undefined) client.records.set('active-1', { ...existing, status: 'rotated' });
    return originalUpdateMany(input);
  };
  client.authCredential.create = async () => {
    attemptedCreate = true;
    throw new Error('create must not be called');
  };
  const repository = new PrismaAuthCredentialRepository(client);

  let error: unknown = null;
  try {
    await repository.replacePasswordCredential({ userId: 'user-1', credentialHash: 'hash:new', changedAt: '2026-07-09T00:15:00.000Z' });
  } catch (caught) {
    error = caught;
  }

  assert.equal(error instanceof Error && /Concurrent password credential rotation detected/.test(error.message), true);
  assert.equal(attemptedCreate, false);
  assert.equal([...client.records.values()].filter((record) => record.status === 'active').length, 0);
});

test('PrismaAuthCredentialRepository creates a new active password credential when no active one exists', async () => {
  const client = new FakeAuthCredentialClient([authCredential({ id: 'disabled', status: 'disabled' })]);
  const repository = new PrismaAuthCredentialRepository(client);

  const created = await repository.replacePasswordCredential({ userId: 'user-1', credentialHash: 'hash:new', changedAt: '2026-07-09T00:20:00.000Z' });
  const createdRecord = client.records.get(created.id);

  assert.equal(created.status, 'active');
  assert.equal(createdRecord?.createdAt.toISOString(), '2026-07-09T00:20:00.000Z');
  assert.equal(createdRecord?.updatedAt.toISOString(), '2026-07-09T00:20:00.000Z');
  assert.equal(createdRecord?.mustRotateAt, null);
});

test('PrismaAuthCredentialRepository preserves AuthCredentialRepository behavior against in-memory repository', async () => {
  const memory = new InMemoryAuthCredentialRepository();
  const prisma = new PrismaAuthCredentialRepository(new FakeAuthCredentialClient());
  const input = { userId: 'user-1', credentialHash: 'hash:new', changedAt: '2026-07-09T00:30:00.000Z', metadata: { source: 'parity' } };

  const memoryCredential = await memory.replacePasswordCredential(input);
  const prismaCredential = await prisma.replacePasswordCredential(input);
  const memoryFound = await memory.findActivePasswordCredentialByUserId('user-1');
  const prismaFound = await prisma.findActivePasswordCredentialByUserId('user-1');

  assert.equal(prismaCredential.userId, memoryCredential.userId);
  assert.equal(prismaCredential.credentialType, memoryCredential.credentialType);
  assert.equal(prismaCredential.credentialHash, memoryCredential.credentialHash);
  assert.equal(prismaCredential.status, memoryCredential.status);
  assert.equal(prismaCredential.lastChangedAt, memoryCredential.lastChangedAt);
  assert.equal(prismaCredential.mustRotateAt, memoryCredential.mustRotateAt);
  assert.equal(JSON.stringify(prismaCredential.metadata), JSON.stringify(memoryCredential.metadata));
  assert.equal(prismaFound?.credentialHash, memoryFound?.credentialHash);
  assert.equal(prismaFound?.status, memoryFound?.status);
});
