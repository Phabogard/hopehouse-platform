import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptService } from '../src/modules/receipts/receipt-service.js';
import type { ReceiptRecord, ReceiptRepository } from '../src/modules/receipts/receipt-repository.js';
import { ForbiddenError, ValidationError } from '../src/core/errors.js';
import type { Actor } from '../src/modules/rbac/authorize.js';

class Repo implements ReceiptRepository {
  constructor(private readonly row: ReceiptRecord | null) {}
  async getById(id: string): Promise<ReceiptRecord | null> {
    return this.row?.id === id ? this.row : null;
  }
}

const receipt: ReceiptRecord = {
  id: 'REC-1',
  rechargeAttemptId: 'ATT-1',
  orderId: 'ORD-1',
  walletId: 'WAL-1',
  receiptNumber: 'RCH-ATT-1',
  amountCents: 2000,
  currency: 'USD',
  issuedAt: '2026-09-22T10:00:00.000Z',
  metadata: {},
  walletOwnerType: 'USER',
  walletOwnerId: 'user-1',
  orderRequesterActorId: 'user-1',
  orderBeneficiaryId: null,
};

test('ReceiptService allows owner and global audit roles', async () => {
  const service = new ReceiptService(new Repo(receipt));
  assert.equal((await service.getReceiptForActor('REC-1', { id: 'user-1', role: 'client' })).id, 'REC-1');
  assert.equal((await service.getReceiptForActor('REC-1', { id: 'auditor-1', role: 'auditor' })).id, 'REC-1');
});

test('ReceiptService forbids unrelated client', async () => {
  const service = new ReceiptService(new Repo(receipt));
  await assert.rejects(
    service.getReceiptForActor('REC-1', { id: 'user-2', role: 'client' }),
    (error: unknown) => error instanceof ForbiddenError,
  );
});

test('ReceiptService returns 404-domain error for unknown receipt', async () => {
  const service = new ReceiptService(new Repo(null));
  await assert.rejects(
    service.getReceiptForActor('missing', { id: 'user-1', role: 'client' }),
    (error: unknown) => error instanceof ValidationError && error.message === 'Reçu introuvable',
  );
});
