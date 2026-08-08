import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaAuthRuntimeContext } from '../src/infrastructure/prisma/auth-runtime.js';
import { createPrismaHopeHouseServer } from '../src/infrastructure/prisma/server-composition.js';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test('createPrismaHopeHouseServer builds a Prisma auth runtime and injects it into the server', async () => {
  const createdWith: unknown[] = [];
  let disconnected = false;

  class FakePrismaClient {
    constructor(options?: unknown) { createdWith.push(options); }
    async $connect(): Promise<void> { return undefined; }
    async $disconnect(): Promise<void> { disconnected = true; }
  }

  const composition = await createPrismaHopeHouseServer({
    auth: {
      jwtSecret: 'composition-secret',
      databaseUrl: 'postgresql://example.test/hopehouse',
      prisma: { loadModule: async () => ({ PrismaClient: FakePrismaClient as never }) },
    },
  });

  await new Promise<void>((resolve) => composition.server.listen(0, resolve));

  try {
    const address = composition.server.address();
    if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json() as { data: { status: string } };

    assert.equal(composition.authRuntime instanceof PrismaAuthRuntimeContext, true);
    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'ok');
    assert.equal(JSON.stringify(createdWith), JSON.stringify([{ datasources: { db: { url: 'postgresql://example.test/hopehouse' } } }]));
  } finally {
    await composition.close();
  }

  assert.equal(disconnected, true);
});

test('createPrismaHopeHouseServer uses the Prisma auth runtime for authenticated HTTP routes', async () => {
  const user = { id: 'prisma-user-1', email: 'prisma-admin@hopehouse.local', status: 'active', roleId: 'system_admin' } as const;
  const credential = {
    id: 'prisma-credential-1',
    userId: user.id,
    credentialType: 'password',
    credentialHash: hash('prisma-password'),
    status: 'active',
    lastChangedAt: new Date('2026-01-01T00:00:00.000Z'),
    mustRotateAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    metadata: {},
  } as const;
  const sessions = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];

  class FakePrismaClient {
    async $connect(): Promise<void> { return undefined; }
    async $disconnect(): Promise<void> { return undefined; }
    async $transaction(operation: (transaction: this) => Promise<unknown>): Promise<unknown> { return operation(this); }

    readonly user = {
      findUnique: async (input: { readonly where: { readonly email?: string; readonly id?: string } }) => {
        calls.push(input.where.email === undefined ? `user:id:${input.where.id}` : `user:email:${input.where.email}`);
        if (input.where.email === user.email || input.where.id === user.id) return user;
        return null;
      },
    };

    readonly authCredential = {
      findFirst: async () => {
        calls.push('credential:find-active');
        return credential;
      },
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      create: async (input: { readonly data: Record<string, unknown> }) => input.data,
    };

    readonly loginAttempt = {
      create: async (input: { readonly data: Record<string, unknown> }) => input.data,
      count: async () => 0,
    };

    readonly loginSession = {
      upsert: async (input: { readonly create: Record<string, unknown> }) => {
        sessions.set(String(input.create.id), input.create);
        return input.create;
      },
      findUnique: async (input: { readonly where: { readonly id: string } }) => {
        calls.push(`session:${input.where.id}`);
        return sessions.get(input.where.id) ?? null;
      },
      findMany: async () => [],
    };

    readonly sessionRefreshToken = {
      upsert: async (input: { readonly create: Record<string, unknown> }) => input.create,
      findUnique: async () => null,
      update: async (input: { readonly data: Record<string, unknown> }) => input.data,
      updateMany: async () => ({ count: 0 }),
      create: async (input: { readonly data: Record<string, unknown> }) => input.data,
    };

    readonly securityEvent = {
      create: async (input: { readonly data: Record<string, unknown> }) => input.data,
      findMany: async () => [],
    };

    readonly deviceFingerprint = {
      upsert: async (input: { readonly create: Record<string, unknown> }) => input.create,
      findUnique: async () => null,
      findMany: async () => [],
    };

    readonly passwordResetRequest = {
      upsert: async (input: { readonly create: Record<string, unknown> }) => input.create,
      findUnique: async () => null,
    };

    readonly twoFactorChallenge = {
      upsert: async (input: { readonly create: Record<string, unknown> }) => input.create,
      findUnique: async () => null,
    };
  }

  const composition = await createPrismaHopeHouseServer({
    auth: {
      jwtSecret: 'composition-secret',
      prisma: { loadModule: async () => ({ PrismaClient: FakePrismaClient as never }) },
    },
  });

  await new Promise<void>((resolve) => composition.server.listen(0, resolve));

  try {
    const address = composition.server.address();
    if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: user.email, password: 'prisma-password' }),
    });
    const login = await loginResponse.json() as { data: { accessToken: string; session: { userId: string } } };

    assert.equal(loginResponse.status, 200);
    assert.equal(login.data.session.userId, user.id);

    const usersResponse = await fetch(`${baseUrl}/users`, { headers: { authorization: `Bearer ${login.data.accessToken}` } });
    assert.equal(usersResponse.status, 200);
  } finally {
    await composition.close();
  }

  assert.equal(calls.includes(`user:email:${user.email}`), true);
  assert.equal(calls.includes('credential:find-active'), true);
  assert.equal(calls.includes(`user:id:${user.id}`), true);
  assert.equal(calls.some((call) => call.startsWith('session:')), true);
});
