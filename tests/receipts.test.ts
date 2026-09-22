import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptService } from '../src/modules/receipts/receipt-service.js';
import type { ReceiptRecord, ReceiptRepository } from '../src/modules/receipts/receipt-repository.js';
import { ForbiddenError, ValidationError } from '../src/core/errors.js';
import type { Actor } from '../src/modules/rbac/authorize.js';

class InMemoryReceiptRepository implements ReceiptRepository {
  constructor(private readonly receipts: ReceiptRecord[] = []) {}

  async getById(receiptId: string): Promise<ReceiptRecord | null> {
    return this.receipts.find((r) => r.id === receiptId) ?? null;
  }
}

const sampleReceipt: ReceiptRecord = Object.freeze({
  id: 'REC-001',
  rechargeAttemptId: 'ATT-001',
  orderId: 'ORD-001',
  walletId: 'WAL-001',
  receiptNumber: 'RCH-ATT-001',
  amountCents: 15000,
  currency: 'USD',
  issuedAt: '2026-09-22T10:00:00.000Z',
  metadata: Object.freeze({ network: 'MTN' }),
  walletOwnerType: 'USER',
  walletOwnerId: 'user-alice',
  orderRequesterActorId: 'user-alice',
  orderBeneficiaryId: null,
});

test('ReceiptService: wallet owner can retrieve their receipt', async () => {
  const repo = new InMemoryReceiptRepository([sampleReceipt]);
  const service = new ReceiptService(repo);

  const actor: Actor = { id: 'user-alice', role: 'client' };
  const result = await service.getReceiptForActor('REC-001', actor);

  assert.equal(result.id, 'REC-001');
  assert.equal(result.amountCents, 15000);
  assert.equal(result.receiptNumber, 'RCH-ATT-001');
});

test('ReceiptService: admin/auditor/finance manager can retrieve any receipt', async () => {
  const repo = new InMemoryReceiptRepository([sampleReceipt]);
  const service = new ReceiptService(repo);

  const adminActor: Actor = { id: 'admin-bob', role: 'system_admin' };
  const auditorActor: Actor = { id: 'auditor-charlie', role: 'auditor' };

  const res1 = await service.getReceiptForActor('REC-001', adminActor);
  const res2 = await service.getReceiptForActor('REC-001', auditorActor);

  assert.equal(res1.id, 'REC-001');
  assert.equal(res2.id, 'REC-001');
});

test('ReceiptService: unauthorized user is forbidden (403) from accessing another user receipt', async () => {
  const repo = new InMemoryReceiptRepository([sampleReceipt]);
  const service = new ReceiptService(repo);

  const attacker: Actor = { id: 'user-eve', role: 'client' };

  await assert.rejects(
    async () => service.getReceiptForActor('REC-001', attacker),
    (err: unknown) => err instanceof ForbiddenError && err.message.includes('Accès non autorisé'),
  );
});

test('ReceiptService: non-existent receipt throws ValidationError (404)', async () => {
  const repo = new InMemoryReceiptRepository([]);
  const service = new ReceiptService(repo);

  const actor: Actor = { id: 'user-alice', role: 'client' };

  await assert.rejects(
    async () => service.getReceiptForActor('REC-UNKNOWN', actor),
    (err: unknown) => err instanceof ValidationError && err.message.includes('Reçu introuvable'),
  );
});

test('ReceiptService: blank receiptId throws ValidationError', async () => {
  const repo = new InMemoryReceiptRepository([sampleReceipt]);
  const service = new ReceiptService(repo);

  const actor: Actor = { id: 'user-alice', role: 'client' };

  await assert.rejects(
    async () => service.getReceiptForActor('  ', actor),
    (err: unknown) => err instanceof ValidationError,
  );
});
