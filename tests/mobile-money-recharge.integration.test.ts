import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PostgresIdempotencyStore } from '../src/infrastructure/prisma/idempotency-store.js';
import { PostgresOutboxStore } from '../src/infrastructure/outbox/postgres-outbox-store.js';
import { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';
import { CreditWalletUseCase } from '../src/modules/wallets/credit-wallet-use-case.js';
import { MobileMoneyRechargeUseCase } from '../src/modules/wallets/mobile-money-recharge-use-case.js';

const databaseUrl = process.env.DATABASE_URL;

function client(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

function build(db: PrismaClient): MobileMoneyRechargeUseCase {
  const walletRepository = new PrismaWalletRepository(db);
  const credit = new CreditWalletUseCase({
    prisma: db,
    walletRepository,
    idempotencyStore: new PostgresIdempotencyStore(db),
    createIdempotencyStore: (tx) => new PostgresIdempotencyStore(tx as any),
    createOutboxStore: (tx) => new PostgresOutboxStore(tx as any),
  });
  return new MobileMoneyRechargeUseCase(db as any, new PostgresIdempotencyStore(db), credit);
}

async function fixture(db: PrismaClient) {
  const userId = `recharge-user-${randomUUID()}`;
  const walletId = `recharge-wallet-${randomUUID()}`;
  const serviceId = `recharge-svc-${randomUUID()}`;
  const orderId = `recharge-order-${randomUUID()}`;

  await db.serviceDefinition.create({
    data: {
      id: serviceId,
      code: `RECHARGE-${serviceId}`,
      name: 'Recharge Mobile Money Test',
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
      orderNumber: `RH-${randomUUID().slice(0, 8)}`,
      serviceDefinitionId: serviceId,
      mode: 'manual',
      requesterActorId: userId,
      currentStep: 'creation',
      amountCents: 2_000n,
      currency: 'USD',
      metadataJson: {},
    },
  });

  return { userId, walletId, serviceId, orderId };
}

async function cleanup(db: PrismaClient, f: Awaited<ReturnType<typeof fixture>>, keys: string[]) {
  await db.outboxMessage.deleteMany({ where: { aggregateId: f.walletId } });
  if (keys.length > 0) await db.$executeRaw`DELETE FROM idempotency_records WHERE key = ANY(${keys})`;
  await db.walletReceipt.deleteMany({ where: { walletId: f.walletId } });
  await db.auditLog.deleteMany({ where: { entityType: 'mobile_money_recharge_attempt' } });
  await db.walletTransaction.deleteMany({ where: { walletId: f.walletId } });
  await db.walletBalance.deleteMany({ where: { walletId: f.walletId } });
  await db.mobileMoneyRechargeAttempt.deleteMany({ where: { walletId: f.walletId } });
  await db.order.deleteMany({ where: { id: f.orderId } });
  await db.wallet.deleteMany({ where: { id: f.walletId } });
  await db.serviceDefinition.deleteMany({ where: { id: f.serviceId } });
}

test('mobile money recharge: confirmation atomique + rejeu idempotent sans second crédit', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const f = await fixture(db);
  const createKey = randomUUID();
  const confirmKey = randomUUID();

  try {
    const useCase = build(db);
    const created = await useCase.create({
      orderId: f.orderId,
      walletId: f.walletId,
      amountCents: 2_000,
      currency: 'USD',
      network: 'test-network',
      externalReference: `mm-${randomUUID()}`,
      actorId: f.userId,
      idempotencyKey: createKey,
    });

    const attemptId = String(created.attempt.id);
    const confirmed = await useCase.confirm({
      attemptId,
      walletId: f.walletId,
      confirmedAmountCents: 2_000,
      confirmedCurrency: 'USD',
      actorId: 'system-admin',
      idempotencyKey: confirmKey,
    });

    assert.equal(confirmed.replayed, false);
    assert.equal(confirmed.attempt.status, 'RECEIPT_ISSUED');
    assert.equal(confirmed.receipt?.receiptNumber, `RCH-${attemptId}`);
    assert.equal(confirmed.receipt?.amountCents, 2_000n);
    assert.equal((await db.walletBalance.findUnique({
      where: { walletId_currency: { walletId: f.walletId, currency: 'USD' } },
    }))?.availableCents, 2_000n);
    assert.equal(await db.walletTransaction.count({ where: { walletId: f.walletId } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: attemptId } }), 1);
    assert.equal(await db.outboxMessage.count({ where: { aggregateId: f.walletId } }), 4);
    assert.equal(await db.walletReceipt.count({ where: { rechargeAttemptId: attemptId } }), 1);

    const replay = await useCase.confirm({
      attemptId,
      walletId: f.walletId,
      confirmedAmountCents: 2_000,
      confirmedCurrency: 'USD',
      actorId: 'system-admin',
      idempotencyKey: confirmKey,
    });
    assert.equal(replay.replayed, true);
    assert.equal(await db.walletTransaction.count({ where: { walletId: f.walletId } }), 1);
    assert.equal(await db.walletReceipt.count({ where: { rechargeAttemptId: attemptId } }), 1);
  } finally {
    await cleanup(db, f, [createKey, confirmKey]);
    await db.$disconnect();
  }
});

test('mobile money recharge: mismatch → aucun crédit Wallet', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const f = await fixture(db);
  const createKey = randomUUID();
  const confirmKey = randomUUID();

  try {
    const useCase = build(db);
    const created = await useCase.create({
      orderId: f.orderId,
      walletId: f.walletId,
      amountCents: 2_000,
      currency: 'USD',
      network: 'test-network',
      actorId: f.userId,
      idempotencyKey: createKey,
    });

    const result = await useCase.confirm({
      attemptId: String(created.attempt.id),
      walletId: f.walletId,
      confirmedAmountCents: 1_999,
      confirmedCurrency: 'USD',
      actorId: 'system-admin',
      idempotencyKey: confirmKey,
    });

    assert.equal(result.attempt.status, 'MISMATCH');
    assert.equal(await db.walletTransaction.count({ where: { walletId: f.walletId } }), 0);
  } finally {
    await cleanup(db, f, [createKey, confirmKey]);
    await db.$disconnect();
  }
});


test('mobile money recharge: référence externe dupliquée → conflit 409 sans corruption', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const f = await fixture(db);
  const createKeyA = randomUUID();
  const createKeyB = randomUUID();
  const externalReference = `mm-duplicate-${randomUUID()}`;

  try {
    const useCase = build(db);
    await useCase.create({
      orderId: f.orderId,
      walletId: f.walletId,
      amountCents: 2_000,
      currency: 'USD',
      network: 'test-network',
      externalReference,
      actorId: f.userId,
      idempotencyKey: createKeyA,
    });

    await assert.rejects(
      () => useCase.create({
        orderId: f.orderId,
        walletId: f.walletId,
        amountCents: 2_000,
        currency: 'USD',
        network: 'test-network',
        externalReference,
        actorId: f.userId,
        idempotencyKey: createKeyB,
      }),
      (error: unknown) => error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'RECHARGE_CONFLICT',
    );
    assert.equal(await db.mobileMoneyRechargeAttempt.count({ where: { walletId: f.walletId } }), 1);
  } finally {
    await cleanup(db, f, [createKeyA, createKeyB]);
    await db.$disconnect();
  }
});

test('mobile money recharge: confirmations concurrentes → un seul crédit et un seul reçu', { skip: databaseUrl === undefined }, async () => {
  const db = client();
  const f = await fixture(db);
  const createKey = randomUUID();
  const confirmKeyA = randomUUID();
  const confirmKeyB = randomUUID();

  try {
    const useCase = build(db);
    const created = await useCase.create({
      orderId: f.orderId,
      walletId: f.walletId,
      amountCents: 2_000,
      currency: 'USD',
      network: 'test-network',
      actorId: f.userId,
      idempotencyKey: createKey,
    });
    const attemptId = String(created.attempt.id);

    const results = await Promise.allSettled([
      useCase.confirm({
        attemptId,
        walletId: f.walletId,
        confirmedAmountCents: 2_000,
        confirmedCurrency: 'USD',
        actorId: 'system-admin',
        idempotencyKey: confirmKeyA,
      }),
      useCase.confirm({
        attemptId,
        walletId: f.walletId,
        confirmedAmountCents: 2_000,
        confirmedCurrency: 'USD',
        actorId: 'system-admin',
        idempotencyKey: confirmKeyB,
      }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal((await db.walletBalance.findUnique({
      where: { walletId_currency: { walletId: f.walletId, currency: 'USD' } },
    }))?.availableCents, 2_000n);
    assert.equal(await db.walletTransaction.count({ where: { walletId: f.walletId } }), 1);
    assert.equal(await db.walletReceipt.count({ where: { rechargeAttemptId: attemptId } }), 1);
  } finally {
    await cleanup(db, f, [createKey, confirmKeyA, confirmKeyB]);
    await db.$disconnect();
  }
});
