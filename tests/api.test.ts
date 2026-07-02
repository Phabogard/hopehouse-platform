import assert from 'node:assert/strict';
import test from 'node:test';
import { createHopeHouseServer } from '../src/app.js';

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createHopeHouseServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('Adresse serveur invalide');

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
}

test('POST /beneficiaries creates a beneficiary from the documented contract', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/beneficiaries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reference: 'BEN-API-001', displayName: 'Bénéficiaire API' }),
    });
    const body = await response.json() as { data: { id: string; reference: string; displayName: string; status: string } };

    assert.equal(response.status, 201);
    assert.equal(body.data.reference, 'BEN-API-001');
    assert.equal(body.data.displayName, 'Bénéficiaire API');
    assert.equal(body.data.status, 'active');

    const auditResponse = await fetch(`${baseUrl}/audit-logs`);
    const auditBody = await auditResponse.json() as { data: Array<{ action: string; entityType: string; entityId: string; outcome: string }> };
    const successfulBeneficiaryAudit = auditBody.data.find((entry) => entry.action === 'beneficiary.create' && entry.entityType === 'beneficiary' && entry.entityId === body.data.id && entry.outcome === 'success');

    assert.equal(auditResponse.status, 200);
    assert.equal(Boolean(successfulBeneficiaryAudit), true);
  });
});

test('POST /payments creates an initiated payment from the documented contract', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beneficiaryId: 'BEN-API-001', amountCents: 12500, currency: 'usd', paymentMethod: 'manual' }),
    });
    const body = await response.json() as { data: { beneficiaryId: string; amountCents: number; currency: string; paymentMethod: string; status: string } };

    assert.equal(response.status, 201);
    assert.equal(body.data.beneficiaryId, 'BEN-API-001');
    assert.equal(body.data.amountCents, 12500);
    assert.equal(body.data.currency, 'USD');
    assert.equal(body.data.paymentMethod, 'manual');
    assert.equal(body.data.status, 'initiated');
  });
});

test('failed sensitive create operations are audited', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ beneficiaryId: 'BEN-API-001', amountCents: -1, currency: 'USD' }),
    });
    assert.equal(response.status, 422);

    const auditResponse = await fetch(`${baseUrl}/audit-logs`);
    const body = await auditResponse.json() as { data: Array<{ action: string; entityType: string; outcome: string; metadata: { path?: string; statusCode?: number } }> };
    const failedPaymentAudit = body.data.find((entry) => entry.action === 'payment.create' && entry.entityType === 'payment' && entry.outcome === 'failure');

    assert.equal(auditResponse.status, 200);
    assert.equal(failedPaymentAudit?.metadata.path, '/payments');
    assert.equal(failedPaymentAudit?.metadata.statusCode, 422);
  });
});
