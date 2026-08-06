import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryTwoFactorChallengeRepository, type TwoFactorChallenge } from '../src/modules/auth-security/index.js';
import { PrismaTwoFactorChallengeRepository, type PrismaTwoFactorChallengeClient } from '../src/infrastructure/prisma/two-factor-challenge-repository.js';

function twoFactorChallenge(input: { id?: string; userId?: string; method?: string; codeHash?: string; status?: TwoFactorChallenge['status']; attempts?: number; maxAttempts?: number; expiresAt?: string; verifiedAt?: string | null; createdAt?: string; metadata?: Record<string, unknown> } = {}): TwoFactorChallenge {
  return Object.freeze({
    id: input.id ?? 'challenge-1',
    userId: input.userId ?? 'user-1',
    method: input.method ?? 'configured',
    codeHash: input.codeHash ?? 'sha256:code',
    status: input.status ?? 'pending',
    attempts: input.attempts ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
    expiresAt: input.expiresAt ?? '2026-07-09T00:05:00.000Z',
    verifiedAt: input.verifiedAt ?? null,
    createdAt: input.createdAt ?? '2026-07-09T00:00:00.000Z',
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

type FakeTwoFactorChallengeRecord = {
  id: string;
  userId: string;
  sessionId: string | null;
  action: string;
  method: string;
  challengeHash: string | null;
  status: TwoFactorChallenge['status'];
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
};

class FakeTwoFactorChallengeClient implements PrismaTwoFactorChallengeClient {
  readonly records = new Map<string, FakeTwoFactorChallengeRecord>();

  readonly twoFactorChallenge: PrismaTwoFactorChallengeClient['twoFactorChallenge'];

  constructor() {
    this.twoFactorChallenge = {
      upsert: async ({ where, create, update }) => {
        const record = { ...(this.records.has(where.id) ? update : create) };
        this.records.set(where.id, record);
        return record;
      },
      findUnique: async ({ where }) => this.records.get(where.id) ?? null,
    };
  }
}

test('PrismaTwoFactorChallengeRepository creates a challenge with Date and metadata mapping', async () => {
  const client = new FakeTwoFactorChallengeClient();
  const repository = new PrismaTwoFactorChallengeRepository(client);
  const challenge = twoFactorChallenge({ metadata: { source: 'unit' } });

  const saved = await repository.save(challenge);
  const record = client.records.get('challenge-1');

  assert.equal(saved.id, challenge.id);
  assert.equal(saved.expiresAt, challenge.expiresAt);
  assert.equal(JSON.stringify(saved.metadata), JSON.stringify(challenge.metadata));
  assert.equal(record?.expiresAt instanceof Date, true);
  assert.equal(record?.createdAt.toISOString(), challenge.createdAt);
  assert.equal(record?.updatedAt.toISOString(), challenge.createdAt);
});

test('PrismaTwoFactorChallengeRepository finds challenges by id', async () => {
  const repository = new PrismaTwoFactorChallengeRepository(new FakeTwoFactorChallengeClient());
  const challenge = twoFactorChallenge({ id: 'challenge-known' });
  await repository.save(challenge);

  const found = await repository.findById('challenge-known');
  const missing = await repository.findById('challenge-missing');

  assert.equal(found?.id, challenge.id);
  assert.equal(missing, null);
});

test('PrismaTwoFactorChallengeRepository maps challengeHash to codeHash and attemptCount to attempts', async () => {
  const client = new FakeTwoFactorChallengeClient();
  const repository = new PrismaTwoFactorChallengeRepository(client);
  const challenge = twoFactorChallenge({ codeHash: 'sha256:mapped', attempts: 2 });

  const saved = await repository.save(challenge);
  const record = client.records.get('challenge-1');

  assert.equal(record?.challengeHash, 'sha256:mapped');
  assert.equal(record?.attemptCount, 2);
  assert.equal(saved.codeHash, 'sha256:mapped');
  assert.equal(saved.attempts, 2);
});

test('PrismaTwoFactorChallengeRepository persists login action and null session id', async () => {
  const client = new FakeTwoFactorChallengeClient();
  const repository = new PrismaTwoFactorChallengeRepository(client);

  await repository.save(twoFactorChallenge());
  const record = client.records.get('challenge-1');

  assert.equal(record?.action, 'auth.login');
  assert.equal(record?.sessionId, null);
});

test('PrismaTwoFactorChallengeRepository updates updatedAt when modifying an existing challenge', async () => {
  const client = new FakeTwoFactorChallengeClient();
  const repository = new PrismaTwoFactorChallengeRepository(client);
  await repository.save(twoFactorChallenge({ id: 'challenge-1', status: 'pending' }));
  const createdUpdatedAt = client.records.get('challenge-1')?.updatedAt.getTime() ?? 0;

  await new Promise((resolve) => setTimeout(resolve, 5));
  await repository.save(twoFactorChallenge({ id: 'challenge-1', status: 'succeeded', verifiedAt: '2026-07-09T00:01:00.000Z' }));
  const updated = client.records.get('challenge-1');

  assert.equal(updated?.status, 'succeeded');
  assert.equal(updated?.verifiedAt?.toISOString(), '2026-07-09T00:01:00.000Z');
  assert.equal((updated?.updatedAt.getTime() ?? 0) > createdUpdatedAt, true);
});

test('PrismaTwoFactorChallengeRepository maps all domain challenge statuses', async () => {
  const repository = new PrismaTwoFactorChallengeRepository(new FakeTwoFactorChallengeClient());
  const statuses: readonly TwoFactorChallenge['status'][] = ['pending', 'succeeded', 'failed', 'expired'];

  for (const status of statuses) {
    const challenge = twoFactorChallenge({ id: `challenge-${status}`, status });
    const saved = await repository.save(challenge);
    const found = await repository.findById(challenge.id);

    assert.equal(saved.status, status);
    assert.equal(found?.status, status);
  }
});

test('PrismaTwoFactorChallengeRepository preserves TwoFactorChallengeRepository behavior against in-memory repository', async () => {
  const memory = new InMemoryTwoFactorChallengeRepository();
  const prisma = new PrismaTwoFactorChallengeRepository(new FakeTwoFactorChallengeClient());
  const pending = twoFactorChallenge({ id: 'challenge-1', status: 'pending' });
  const failed = twoFactorChallenge({ id: 'challenge-1', status: 'failed', attempts: 3, metadata: { reason: 'max-attempts' } });

  await memory.save(pending);
  await prisma.save(pending);
  assert.equal(JSON.stringify(await prisma.findById('challenge-1')), JSON.stringify(await memory.findById('challenge-1')));

  await memory.save(failed);
  await prisma.save(failed);
  assert.equal(JSON.stringify(await prisma.findById('challenge-1')), JSON.stringify(await memory.findById('challenge-1')));
});
