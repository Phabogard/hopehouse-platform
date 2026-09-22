import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaReceiptRepository } from '../src/infrastructure/prisma/receipt-repository.js';
import { ReceiptService } from '../src/modules/receipts/receipt-service.js';
import { ForbiddenError } from '../src/core/errors.js';

const databaseUrl = process.env.DATABASE_URL;

function client(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

test('receipts integration: PrismaReceiptRepository reads receipt from PostgreSQL with ownership enforcement', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const userId = `user-receipt-${randomUUID()}`;
  const otherUserId = `user-other-${randomUUID()}`;
  const walletId = `wallet-receipt-${randomUUID()}`;
  const serviceId = `svc-receipt-${randomUUID()}`;
  const orderId = `order-receipt-${randomUUID()}`;
  const attemptId = randomUUID();
  const receiptId = randomUUID();

  try {
    await db.serviceDefinition.create({
      data: {
        id: serviceId,
        code: `SVC-${serviceId}`,
        name: 'Service Receipt Integration Test',
        type: 'mobile_credit',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      },
    });

    await db.wallet.create({ data: { id: walletId, ownerType: 'USER', ownerId: userId } });

    await db.order.create({
      data: {
        id: orderId,
        orderNumber: `RCH-${randomUUID().slice(0, 8)}`,
        serviceDefinitionId: serviceId,
        mode: 'manual',
        requesterActorId: userId,
        currentStep: 'creation',
        amountCents: 10_000n,
        currency: 'USD',
        metadataJson: {},
      },
    });

    await db.mobileMoneyRechargeAttempt.create({
      data: {
        id: attemptId,
        orderId,
        walletId,
        requestedAmountCents: 10_000n,
        requestedCurrency: 'USD',
        network: 'MTN',
        status: 'RECEIPT_ISSUED',
        externalReference: `ext-${randomUUID()}`,
        metadataJson: {},
      },
    });

    await db.walletReceipt.create({
      data: {
        id: receiptId,
        rechargeAttemptId: attemptId,
        orderId,
        walletId,
        receiptNumber: `RCH-${attemptId}`,
        amountCents: 10_000n,
        currency: 'USD',
        issuedAt: new Date(),
        metadataJson: { source: 'mobile_money_recharge', network: 'MTN' },
      },
    });

    const repo = new PrismaReceiptRepository(db);
    const service = new ReceiptService(repo);

    // 1. Owner can access receipt
    const ownerReceipt = await service.getReceiptForActor(receiptId, { id: userId, role: 'client' });
    assert.equal(ownerReceipt.id, receiptId);
    assert.equal(ownerReceipt.amountCents, 10_000);
    assert.equal(ownerReceipt.receiptNumber, `RCH-${attemptId}`);
    assert.equal(typeof ownerReceipt.amountCents, 'number');

    // 2. Admin can access receipt
    const adminReceipt = await service.getReceiptForActor(receiptId, { id: 'admin-1', role: 'system_admin' });
    assert.equal(adminReceipt.id, receiptId);

    // 3. Unrelated user is forbidden
    await assert.rejects(
      async () => service.getReceiptForActor(receiptId, { id: otherUserId, role: 'client' }),
      (err: unknown) => err instanceof ForbiddenError,
    );
  } finally {
    await db.walletReceipt.deleteMany({ where: { id: receiptId } });
    await db.mobileMoneyRechargeAttempt.deleteMany({ where: { id: attemptId } });
    await db.order.deleteMany({ where: { id: orderId } });
    await db.wallet.deleteMany({ where: { id: walletId } });
    await db.serviceDefinition.deleteMany({ where: { id: serviceId } });
    await db.$disconnect();
  }
});
