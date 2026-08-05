import assert from 'node:assert/strict';
import test from 'node:test';
import { createPrismaClient, type PrismaClientLifecycle } from '../src/infrastructure/prisma/client.js';

class FakePrismaClient implements PrismaClientLifecycle {
  static createdWith: unknown[] = [];

  constructor(options?: unknown) {
    FakePrismaClient.createdWith.push(options);
  }

  async $connect(): Promise<void> {}
  async $disconnect(): Promise<void> {}
}

test('createPrismaClient creates an injectable Prisma-compatible client without loading runtime services', async () => {
  FakePrismaClient.createdWith = [];

  const client = await createPrismaClient({
    databaseUrl: 'postgresql://example.test/hopehouse',
    loadModule: async () => ({ PrismaClient: FakePrismaClient }),
  });

  assert.equal(client instanceof FakePrismaClient, true);
  assert.equal(JSON.stringify(FakePrismaClient.createdWith), JSON.stringify([{ datasources: { db: { url: 'postgresql://example.test/hopehouse' } } }]));
});

test('createPrismaClient does not require a database URL override', async () => {
  FakePrismaClient.createdWith = [];

  await createPrismaClient({ loadModule: async () => ({ PrismaClient: FakePrismaClient }) });

  assert.equal(JSON.stringify(FakePrismaClient.createdWith), JSON.stringify([undefined]));
});
