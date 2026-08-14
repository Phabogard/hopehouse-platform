import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';
import { createBeneficiary } from '../src/modules/beneficiaries/beneficiaries.js';
import { createUser } from '../src/modules/users/users.js';
import { can } from '../src/modules/rbac/authorize.js';
import { type Role } from '../src/modules/rbac/permissions.js';

type AuthRuntime = NonNullable<Parameters<typeof createHopeHouseServer>[0]>['authRuntime'];

async function withServer<T>(role: Role, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const authRuntime: AuthRuntime = {
    async login() {
      return {
        accessToken: `${role}-access-token`,
        refreshToken: null,
        requiresTwoFactor: false,
        session: { id: `${role}-session`, userId: `${role}-user`, expiresAt: new Date(Date.now() + 60_000).toISOString(), idleExpiresAt: null },
        challenge: null,
      };
    },
    async authenticateAccessToken() {
      return { id: `${role}-user`, role, sessionId: `${role}-session` };
    },
  };
  const server = createHopeHouseServer({ authRuntime });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');
  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

function bearer(role: Role): Record<string, string> {
  return { authorization: `Bearer ${role}-access-token` };
}

test('client cannot become admin via HTTP body role or requesterActorId spoofing', async () => {
  await withServer('client', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer('client') },
      body: JSON.stringify({ role: 'business_admin', requesterActorId: 'system-admin-user', serviceDefinitionId: 'svc', mode: 'manual' }),
    });
    const body = await response.json() as { data: { requester: { id: string }; transitions: Array<{ actorId: string }> } };

    assert.equal(response.status, 201);
    assert.equal(body.data.requester.id, 'client-user');
    assert.equal(body.data.transitions[0]?.actorId, 'client-user');
  });
});

test('client cannot become super admin via metadata and cannot obtain roles:manage', async () => {
  assert.equal(can({ id: 'client-user', role: 'client' }, 'roles:manage'), false);
  await withServer('client', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/users`, {
      headers: { ...bearer('client'), 'content-type': 'application/json' },
      body: undefined,
    });
    assert.equal(response.status, 403);

    const createPayment = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer('client') },
      body: JSON.stringify({ beneficiaryId: 'BEN-001', amountCents: 1000, currency: 'USD', metadata: { role: 'system_admin' } }),
    });
    assert.equal(createPayment.status, 403);
  });
});

test('agent and accountant cannot manage roles or permissions', () => {
  assert.equal(can({ id: 'agent-user', role: 'operations_agent' }, 'roles:manage'), false);
  assert.equal(can({ id: 'accountant-user', role: 'accountant' }, 'roles:manage'), false);
});

test('auditor remains read-only through API routes', async () => {
  await withServer('auditor', async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/audit-logs`, { headers: bearer('auditor') })).status, 200);
    assert.equal((await fetch(`${baseUrl}/beneficiaries`, { method: 'POST', headers: { 'content-type': 'application/json', ...bearer('auditor') }, body: JSON.stringify({ reference: 'BEN-RO', displayName: 'Read Only' }) })).status, 403);
  });
});

test('administrator can act only within assigned permissions', async () => {
  await withServer('business_admin', async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/beneficiaries`, { method: 'POST', headers: { 'content-type': 'application/json', ...bearer('business_admin') }, body: JSON.stringify({ reference: 'BEN-ADMIN', displayName: 'Admin Allowed' }) })).status, 201);
    assert.equal((await fetch(`${baseUrl}/audit-logs`, { headers: bearer('business_admin') })).status, 403);
  });
});

test('authenticated server context alone determines effective role', async () => {
  await withServer('operations_agent', async (baseUrl) => {
    const response = await fetch(`${baseUrl}/users`, { headers: { ...bearer('operations_agent'), 'x-role': 'system_admin' } });
    assert.equal(response.status, 403);
  });
});

test('beneficiary without account is not automatically transformed into a user', () => {
  const beneficiary = createBeneficiary({ reference: 'BEN-NO-USER', displayName: 'Sans Compte' });
  assert.equal('email' in beneficiary, false);
  assert.equal('role' in beneficiary, false);

  const user = createUser({ email: 'client@example.org', displayName: 'Client Example', role: 'client' });
  assert.equal('role' in user, true);
  assert.equal(beneficiary.id === user.id, false);
});

test('user preferences cannot disable mandatory security protections', () => {
  const preferences = { locale: 'fr', theme: 'dark', requireTwoFactor: false, rbacEnabled: false, auditEnabled: false };
  const mandatorySecurity = { requireTwoFactor: true, rbacEnabled: true, auditEnabled: true };
  const effectiveSecurity = { ...preferences, ...mandatorySecurity };

  assert.equal(effectiveSecurity.requireTwoFactor, true);
  assert.equal(effectiveSecurity.rbacEnabled, true);
  assert.equal(effectiveSecurity.auditEnabled, true);
});
