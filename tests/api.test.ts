import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';

const authOptions = { auth: { jwtSecret: 'api-test-jwt-secret', bootstrapPassword: 'test-password' } } as const;

async function withServer<T>(run: (baseUrl: string) => Promise<T>, options?: Parameters<typeof createHopeHouseServer>[0]): Promise<T> {
  const server = createHopeHouseServer(options);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: 'admin@hopehouse.local',
      password: 'test-password',
      device: { fingerprint: 'api-device-1', ipAddress: '203.0.113.20', metadata: { platform: 'node-test' } },
    }),
  });
  const body = await response.json() as { data: { accessToken: string } };
  assert.equal(response.status, 200);
  return body.data.accessToken;
}

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

test('POST /auth/login returns a signed access token, refresh token, and revocable session', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: 'admin@hopehouse.local',
        password: 'test-password',
        device: { fingerprint: 'api-device-1', ipAddress: '203.0.113.20', metadata: { platform: 'node-test' } },
      }),
    });
    const body = await response.json() as { data: { accessToken: string; refreshToken: string; requiresTwoFactor: boolean; session: { id: string; userId: string; expiresAt: string; idleExpiresAt: string | null } } };

    assert.equal(response.status, 200);
    assert.equal(body.data.accessToken.split('.').length, 3);
    assert.equal(typeof body.data.refreshToken, 'string');
    assert.equal(body.data.requiresTwoFactor, false);
    assert.equal(body.data.session.userId, 'bootstrap-system-admin');
  }, authOptions);
});

test('POST /auth/login rejects invalid credentials and requires configured auth context', async () => {
  await withServer(async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'wrong-password' }),
    });
    assert.equal(invalidResponse.status, 403);
  }, authOptions);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'test-password' }),
    });
    assert.equal(response.status, 422);
  });
});

test('createHopeHouseServer uses an injected auth runtime for login and protected routes', async () => {
  const calls: string[] = [];
  const authRuntime: NonNullable<Parameters<typeof createHopeHouseServer>[0]>['authRuntime'] = {
    async login(input) {
      calls.push(`login:${input.identifier}`);
      return {
        accessToken: 'injected-access-token',
        refreshToken: 'injected-refresh-token',
        requiresTwoFactor: false,
        session: { id: 'injected-session', userId: 'injected-user', expiresAt: new Date(Date.now() + 60_000).toISOString(), idleExpiresAt: null },
        challenge: null,
      };
    },
    async authenticateAccessToken(token) {
      calls.push(`authenticate:${token}`);
      return { id: 'injected-user', role: 'system_admin', sessionId: 'injected-session' };
    },
  };

  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'ignored-by-fake' }),
    });
    const loginBody = await loginResponse.json() as { data: { accessToken: string; refreshToken: string; session: { id: string } } };

    assert.equal(loginResponse.status, 200);
    assert.equal(loginBody.data.accessToken, 'injected-access-token');
    assert.equal(loginBody.data.refreshToken, 'injected-refresh-token');
    assert.equal(loginBody.data.session.id, 'injected-session');

    const usersResponse = await fetch(`${baseUrl}/users`, { headers: { authorization: 'Bearer injected-access-token' } });
    assert.equal(usersResponse.status, 200);
  }, { authRuntime });

  assert.equal(JSON.stringify(calls), JSON.stringify(['login:admin@hopehouse.local', 'authenticate:injected-access-token']));
});

test('createHopeHouseServer keeps the in-memory auth runtime when auth options are provided', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'test-password' }),
    });
    const body = await response.json() as { data: { session: { userId: string } } };

    assert.equal(response.status, 200);
    assert.equal(body.data.session.userId, 'bootstrap-system-admin');
  }, authOptions);
});

test('createHopeHouseServer keeps auth disabled without auth options or injected runtime', async () => {
  await withServer(async (baseUrl) => {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'test-password' }),
    });
    assert.equal(loginResponse.status, 422);

    const usersResponse = await fetch(`${baseUrl}/users`);
    assert.equal(usersResponse.status, 401);
  });
});

test('createHopeHouseServer prioritizes an injected auth runtime over auth options', async () => {
  let loginCalled = false;
  const authRuntime: NonNullable<Parameters<typeof createHopeHouseServer>[0]>['authRuntime'] = {
    async login() {
      loginCalled = true;
      return {
        accessToken: 'priority-access-token',
        refreshToken: null,
        requiresTwoFactor: false,
        session: { id: 'priority-session', userId: 'priority-user', expiresAt: new Date(Date.now() + 60_000).toISOString(), idleExpiresAt: null },
        challenge: null,
      };
    },
    async authenticateAccessToken() {
      return { id: 'priority-user', role: 'system_admin', sessionId: 'priority-session' };
    },
  };

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hopehouse.local', password: 'priority-password' }),
    });
    const body = await response.json() as { data: { accessToken: string; session: { userId: string } } };

    assert.equal(response.status, 200);
    assert.equal(body.data.accessToken, 'priority-access-token');
    assert.equal(body.data.session.userId, 'priority-user');
  }, { auth: { jwtSecret: 'priority-secret' }, authRuntime });

  assert.equal(loginCalled, true);
});

test('protected business routes require a Bearer access token', async () => {
  await withServer(async (baseUrl) => {
    for (const path of ['/users', '/beneficiaries', '/services', '/subscriptions', '/payments', '/invoices', '/audit-logs']) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.json() as { error: { code: string; message: string } };
      assert.equal(response.status, 401, path);
      assert.equal(body.error.code, 'UNAUTHORIZED', path);
    }

    for (const request of [
      fetch(`${baseUrl}/beneficiaries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reference: 'BEN-API-001', displayName: 'Bénéficiaire API' }) }),
      fetch(`${baseUrl}/payments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ beneficiaryId: 'BEN-API-001', amountCents: 12500, currency: 'usd' }) }),
      fetch(`${baseUrl}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requesterActorId: 'actor-api-1', serviceDefinitionId: 'svc', mode: 'manual' }) }),
      fetch(`${baseUrl}/orders/order-1/transitions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actorId: 'actor-api-1', toStep: 'validation' }) }),
    ]) {
      const response = await request;
      assert.equal(response.status, 401);
    }

    const malformedResponse = await fetch(`${baseUrl}/users`, { headers: { authorization: 'Token invalid' } });
    assert.equal(malformedResponse.status, 401);
  }, authOptions);
});

test('protected business routes reject invalid Bearer access tokens as unauthenticated', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/users`, { headers: { authorization: 'Bearer invalid.token.value' } });
    const body = await response.json() as { error: { code: string; message: string } };

    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHORIZED');
  }, authOptions);
});

test('GET business routes use the authenticated actor for RBAC reads', async () => {
  await withServer(async (baseUrl) => {
    const accessToken = await login(baseUrl);

    const usersResponse = await fetch(`${baseUrl}/users`, { headers: bearer(accessToken) });
    assert.equal(usersResponse.status, 200);

    const beneficiariesResponse = await fetch(`${baseUrl}/beneficiaries`, { headers: bearer(accessToken) });
    assert.equal(beneficiariesResponse.status, 200);

    const servicesResponse = await fetch(`${baseUrl}/services`, { headers: bearer(accessToken) });
    assert.equal(servicesResponse.status, 200);

    const subscriptionsResponse = await fetch(`${baseUrl}/subscriptions`, { headers: bearer(accessToken) });
    assert.equal(subscriptionsResponse.status, 200);

    const paymentsResponse = await fetch(`${baseUrl}/payments`, { headers: bearer(accessToken) });
    assert.equal(paymentsResponse.status, 200);

    const invoicesResponse = await fetch(`${baseUrl}/invoices`, { headers: bearer(accessToken) });
    assert.equal(invoicesResponse.status, 200);

    const auditResponse = await fetch(`${baseUrl}/audit-logs`, { headers: bearer(accessToken) });
    assert.equal(auditResponse.status, 200);
  }, authOptions);
});

test('authenticated business routes return 403 when RBAC denies the action', async () => {
  await withServer(async (baseUrl) => {
    const accessToken = await login(baseUrl);

    const beneficiaryResponse = await fetch(`${baseUrl}/beneficiaries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ reference: 'BEN-API-001', displayName: 'Bénéficiaire API' }),
    });
    assert.equal(beneficiaryResponse.status, 403);

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ beneficiaryId: 'BEN-API-001', amountCents: 12500, currency: 'usd', paymentMethod: 'manual' }),
    });
    assert.equal(paymentResponse.status, 403);
  }, authOptions);
});

test('failed sensitive authenticated create operations are audited with authenticated actor context', async () => {
  await withServer(async (baseUrl) => {
    const accessToken = await login(baseUrl);
    const response = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ beneficiaryId: 'BEN-API-001', amountCents: -1, currency: 'USD' }),
    });
    assert.equal(response.status, 403);

    const auditResponse = await fetch(`${baseUrl}/audit-logs`, { headers: bearer(accessToken) });
    const body = await auditResponse.json() as { data: Array<{ actorUserId: string; action: string; entityType: string; outcome: string; metadata: { path?: string; statusCode?: number } }> };
    const failedPaymentAudit = body.data.find((entry) => entry.action === 'payment.create' && entry.entityType === 'payment' && entry.outcome === 'failure');

    assert.equal(auditResponse.status, 200);
    assert.equal(failedPaymentAudit?.actorUserId, 'bootstrap-system-admin');
    assert.equal(failedPaymentAudit?.metadata.path, '/payments');
    assert.equal(failedPaymentAudit?.metadata.statusCode, 403);
  }, authOptions);
});

test('POST /orders creates a generic order for the authenticated actor at the official creation step', async () => {
  await withServer(async (baseUrl) => {
    const accessToken = await login(baseUrl);
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({
        requesterActorId: 'spoofed-actor',
        serviceDefinitionId: 'service-definition-from-configuration',
        mode: 'manual',
        beneficiaryId: 'BEN-API-001',
        channel: 'api',
        monetaryIntent: { amountCents: 2500, currency: 'usd' },
        metadata: { source: 'api-test' },
      }),
    });
    const body = await response.json() as { data: { id: string; currentStep: string; requester: { id: string }; configuration: { serviceDefinitionId: string; mode: string }; monetaryIntent: { amountCents: number; currency: string }; transitions: Array<{ actorId: string; toStep: string }> } };

    assert.equal(response.status, 201);
    assert.equal(body.data.currentStep, 'creation');
    assert.equal(body.data.requester.id, 'bootstrap-system-admin');
    assert.equal(body.data.configuration.serviceDefinitionId, 'service-definition-from-configuration');
    assert.equal(body.data.configuration.mode, 'manual');
    assert.equal(body.data.monetaryIntent.currency, 'USD');
    assert.equal(body.data.transitions.length, 1);
    assert.equal(body.data.transitions[0]?.actorId, 'bootstrap-system-admin');
    assert.equal(body.data.transitions[0]?.toStep, 'creation');
  }, authOptions);
});

test('POST /orders/{orderId}/transitions advances only to the next official step for the authenticated actor', async () => {
  await withServer(async (baseUrl) => {
    const accessToken = await login(baseUrl);
    const createResponse = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ requesterActorId: 'spoofed-actor', serviceDefinitionId: 'service-definition-from-configuration', mode: 'automatic' }),
    });
    const created = await createResponse.json() as { data: { id: string } };

    const invalidResponse = await fetch(`${baseUrl}/orders/${created.data.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ actorId: 'spoofed-actor', toStep: 'payment' }),
    });
    assert.equal(invalidResponse.status, 422);

    const validResponse = await fetch(`${baseUrl}/orders/${created.data.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bearer(accessToken) },
      body: JSON.stringify({ actorId: 'spoofed-actor', toStep: 'validation', metadata: { checked: true } }),
    });
    const advanced = await validResponse.json() as { data: { currentStep: string; transitions: Array<{ actorId: string; fromStep: string | null; toStep: string }> } };

    assert.equal(validResponse.status, 200);
    assert.equal(advanced.data.currentStep, 'validation');
    assert.equal(advanced.data.transitions.length, 2);
    assert.equal(advanced.data.transitions[1]?.actorId, 'bootstrap-system-admin');
    assert.equal(advanced.data.transitions[1]?.fromStep, 'creation');
    assert.equal(advanced.data.transitions[1]?.toStep, 'validation');
  }, authOptions);
});

function authRuntimeForRole(role: 'system_admin' | 'business_admin' | 'operations_agent' | 'finance_manager' | 'client' | 'accountant' | 'auditor'): NonNullable<Parameters<typeof createHopeHouseServer>[0]>['authRuntime'] {
  return {
    async login() {
      return {
        accessToken: `${role}-access-token`,
        refreshToken: `${role}-refresh-token`,
        requiresTwoFactor: false,
        session: { id: `${role}-session`, userId: `${role}-user`, expiresAt: new Date(Date.now() + 60_000).toISOString(), idleExpiresAt: null },
        challenge: null,
      };
    },
    async authenticateAccessToken() {
      return { id: `${role}-user`, role, sessionId: `${role}-session` };
    },
  };
}

test('client authenticated actor can create only its own generic order and cannot spoof actor role from HTTP body', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer client-access-token' },
      body: JSON.stringify({ requesterActorId: 'spoofed-admin', role: 'system_admin', serviceDefinitionId: 'configured-service', mode: 'manual' }),
    });
    const body = await response.json() as { data: { requester: { id: string }; transitions: Array<{ actorId: string }> } };

    assert.equal(response.status, 201);
    assert.equal(body.data.requester.id, 'client-user');
    assert.equal(body.data.transitions[0]?.actorId, 'client-user');
  }, { authRuntime: authRuntimeForRole('client') });
});

test('client authenticated actor is refused administrative, accounting, and global audit routes', async () => {
  await withServer(async (baseUrl) => {
    for (const path of ['/users', '/payments', '/audit-logs']) {
      const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: 'Bearer client-access-token' } });
      assert.equal(response.status, 403, path);
    }

    const createPayment = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer client-access-token' },
      body: JSON.stringify({ beneficiaryId: 'BEN-001', amountCents: 1000, currency: 'USD', role: 'system_admin' }),
    });
    assert.equal(createPayment.status, 403);
  }, { authRuntime: authRuntimeForRole('client') });
});

test('agent cannot access administrative user routes', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/users`, { headers: { authorization: 'Bearer agent-access-token' } });
    assert.equal(response.status, 403);
  }, { authRuntime: authRuntimeForRole('operations_agent') });
});

test('auditor remains read-only for global audit and cannot create business data', async () => {
  await withServer(async (baseUrl) => {
    const auditResponse = await fetch(`${baseUrl}/audit-logs`, { headers: { authorization: 'Bearer auditor-access-token' } });
    assert.equal(auditResponse.status, 200);

    const paymentResponse = await fetch(`${baseUrl}/payments`, { headers: { authorization: 'Bearer auditor-access-token' } });
    assert.equal(paymentResponse.status, 403);

    const createBeneficiary = await fetch(`${baseUrl}/beneficiaries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer auditor-access-token' },
      body: JSON.stringify({ reference: 'BEN-AUDIT', displayName: 'Auditor Attempt' }),
    });
    assert.equal(createBeneficiary.status, 403);
  }, { authRuntime: authRuntimeForRole('auditor') });
});
