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
