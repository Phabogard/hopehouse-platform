import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryPasswordResetRequestRepository, type PasswordResetRequestRecord } from '../src/modules/auth-security/index.js';
import { PrismaPasswordResetRequestRepository, type PrismaPasswordResetRequestClient } from '../src/infrastructure/prisma/password-reset-request-repository.js';

function passwordResetRequest(input: { id?: string; userId?: string | null; identifierHash?: string; tokenHash?: string; status?: PasswordResetRequestRecord['status']; expiresAt?: string; completedAt?: string | null; createdAt?: string; metadata?: Record<string, unknown> } = {}): PasswordResetRequestRecord {
  return Object.freeze({
    id: input.id ?? 'reset-1',
    userId: input.userId ?? 'user-1',
    identifierHash: input.identifierHash ?? 'sha256:identifier',
    tokenHash: input.tokenHash ?? 'sha256:token',
    status: input.status ?? 'pending',
    expiresAt: input.expiresAt ?? '2026-07-09T00:15:00.000Z',
    completedAt: input.completedAt ?? null,
    createdAt: input.createdAt ?? '2026-07-09T00:00:00.000Z',
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

class FakePasswordResetRequestClient implements PrismaPasswordResetRequestClient {
  readonly records = new Map<string, {
    id: string;
    userId: string | null;
    identifierHash: string;
    tokenHash: string;
    status: PasswordResetRequestRecord['status'];
    expiresAt: Date;
    completedAt: Date | null;
    createdAt: Date;
    metadata: unknown;
  }>();

  readonly passwordResetRequest: PrismaPasswordResetRequestClient['passwordResetRequest'];

  constructor() {
    this.passwordResetRequest = {
      upsert: async ({ where, create, update }) => {
        const record = { ...(this.records.has(where.id) ? update : create) };
        this.records.set(where.id, record);
        return record;
      },
      findUnique: async ({ where }) => [...this.records.values()].find((record) => record.tokenHash === where.tokenHash) ?? null,
    };
  }
}

test('PrismaPasswordResetRequestRepository saves and finds reset requests by token hash', async () => {
  const client = new FakePasswordResetRequestClient();
  const repository = new PrismaPasswordResetRequestRepository(client);
  const request = passwordResetRequest({ metadata: { source: 'unit' } });

  const saved = await repository.save(request);
  const found = await repository.findByTokenHash('sha256:token');

  assert.equal(saved.id, request.id);
  assert.equal(found?.id, request.id);
  assert.equal(found?.expiresAt, request.expiresAt);
  assert.equal(JSON.stringify(found?.metadata), JSON.stringify(request.metadata));
  assert.equal(client.records.get('reset-1')?.expiresAt instanceof Date, true);
});

test('PrismaPasswordResetRequestRepository updates an existing request through save', async () => {
  const client = new FakePasswordResetRequestClient();
  const repository = new PrismaPasswordResetRequestRepository(client);
  await repository.save(passwordResetRequest({ id: 'reset-1', status: 'pending' }));
  const completed = passwordResetRequest({ id: 'reset-1', status: 'completed', completedAt: '2026-07-09T00:05:00.000Z', metadata: { completed: true } });

  const saved = await repository.save(completed);

  assert.equal(saved.status, 'completed');
  assert.equal(saved.completedAt, '2026-07-09T00:05:00.000Z');
  assert.equal(client.records.size, 1);
});

test('PrismaPasswordResetRequestRepository returns null for unknown token hashes', async () => {
  const repository = new PrismaPasswordResetRequestRepository(new FakePasswordResetRequestClient());

  const request = await repository.findByTokenHash('sha256:missing');

  assert.equal(request, null);
});

test('PrismaPasswordResetRequestRepository preserves PasswordResetRequestRepository behavior against in-memory repository', async () => {
  const memory = new InMemoryPasswordResetRequestRepository();
  const client = new FakePasswordResetRequestClient();
  const prisma = new PrismaPasswordResetRequestRepository(client);
  const request = passwordResetRequest({ id: 'reset-1', tokenHash: 'sha256:token' });
  const completed = passwordResetRequest({ id: 'reset-1', tokenHash: 'sha256:token', status: 'completed', completedAt: '2026-07-09T00:05:00.000Z' });

  await memory.save(request);
  await prisma.save(request);
  assert.equal(JSON.stringify(await prisma.findByTokenHash('sha256:token')), JSON.stringify(await memory.findByTokenHash('sha256:token')));

  await memory.save(completed);
  await prisma.save(completed);
  assert.equal(JSON.stringify(await prisma.findByTokenHash('sha256:token')), JSON.stringify(await memory.findByTokenHash('sha256:token')));
});
