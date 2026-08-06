import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAuthUserRepository, type AuthenticatedUser } from '../src/modules/auth-security/index.js';
import { PrismaAuthUserRepository, type PrismaAuthUserClient } from '../src/infrastructure/prisma/auth-user-repository.js';

type FakeAuthUserRecord = {
  id: string;
  email: string;
  status: AuthenticatedUser['status'];
  roleId: string;
};

class FakeAuthUserClient implements PrismaAuthUserClient {
  readonly records = new Map<string, FakeAuthUserRecord>();
  readonly user: PrismaAuthUserClient['user'];

  constructor(users: readonly FakeAuthUserRecord[] = []) {
    for (const user of users) this.records.set(user.email, user);
    this.user = {
      findUnique: async ({ where }) => this.records.get(where.email) ?? null,
    };
  }
}

function persistedUser(input: { id?: string; email?: string; status?: AuthenticatedUser['status']; roleId?: string } = {}): FakeAuthUserRecord {
  return {
    id: input.id ?? 'user-1',
    email: input.email ?? 'admin@hopehouse.local',
    status: input.status ?? 'active',
    roleId: input.roleId ?? 'system_admin',
  };
}

test('PrismaAuthUserRepository finds users by identifier mapped to persisted email', async () => {
  const client = new FakeAuthUserClient([persistedUser()]);
  const repository = new PrismaAuthUserRepository(client);

  const user = await repository.findByIdentifier('admin@hopehouse.local');

  assert.equal(user?.id, 'user-1');
  assert.equal(user?.identifier, 'admin@hopehouse.local');
  assert.equal(user?.status, 'active');
});

test('PrismaAuthUserRepository maps persisted roleId to transitional metadata.role compatibility', async () => {
  const client = new FakeAuthUserClient([persistedUser({ roleId: 'auditor' })]);
  const repository = new PrismaAuthUserRepository(client);

  const user = await repository.findByIdentifier('admin@hopehouse.local');

  assert.equal(user?.metadata.role, 'auditor');
  assert.equal(JSON.stringify(Object.keys(user?.metadata ?? {})), JSON.stringify(['role']));
});

test('PrismaAuthUserRepository returns null for unknown identifiers', async () => {
  const repository = new PrismaAuthUserRepository(new FakeAuthUserClient());

  const user = await repository.findByIdentifier('missing@hopehouse.local');

  assert.equal(user, null);
});

test('PrismaAuthUserRepository preserves AuthUserRepository lookup behavior against in-memory repository', async () => {
  const memoryUser: AuthenticatedUser = Object.freeze({
    id: 'user-1',
    identifier: 'admin@hopehouse.local',
    status: 'active',
    metadata: Object.freeze({ role: 'system_admin' }),
  });
  const memory = new InMemoryAuthUserRepository([memoryUser]);
  const prisma = new PrismaAuthUserRepository(new FakeAuthUserClient([persistedUser()]));

  assert.equal(JSON.stringify(await prisma.findByIdentifier('admin@hopehouse.local')), JSON.stringify(await memory.findByIdentifier('admin@hopehouse.local')));
  assert.equal(await prisma.findByIdentifier('missing@hopehouse.local'), await memory.findByIdentifier('missing@hopehouse.local'));
});
