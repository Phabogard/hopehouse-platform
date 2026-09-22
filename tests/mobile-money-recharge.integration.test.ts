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

function build(client: PrismaClient): MobileMoneyRechargeUseCase {
  const walletRepository = new PrismaWalletRepository(client);
  const credit = new CreditWalletUseCase({
    prisma: client,
    walletRepository,
    idempotencyStore: new PostgresIdempotencyStore(client),
    createIdempotencyStore: (tx) => new PostgresIdempotencyStore(tx as any),
    createOutboxStore: (tx) => new PostgresOutboxStore(tx as any),
  });
  return new MobileMoneyRechargeUseCase(
    client as any,
    new PostgresIdempotencyStore(client),
    credit,
  );
}

async function fixture(db: PrismaClient) {
  const userId = `recharge-user-${randomUUID()}`;
  const walletId = `recharge-wallet-${randomUUID()}`;
  const serviceId = `recharge-svc-${randomUUID()}`;
  const orderId = `recharge-order-${randomUUID()}`;
  const orderNumber = `RH-${randomUUID().slice(0, 8)}`;

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
      orderNumber,
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

async function cleanup(db: PrismaClient, fixture: Awaited<ReturnType<typeof fixture>>, idempotencyKeys: string[]) {
  await db.outboxMessage.deleteMany({ where: { aggregateId: fixture.walletId } });
  await db.outboxMessage.deleteMany({ where: { aggregateId: fixture.orderId } });
  if (idempotencyKeys.length > 0) {
    await db.$executeRaw`DELETE FROM idempotency_records WHERE key = ANY(${idempotencyKeys})`;
  }
  await db.auditLog.deleteMany({ where: { entityType: 'mobile_money_recharge_attempt' } });
  await db.walletTransaction.deleteMany({ where: { walletId: fixture.walletId } });
  await db.walletBalance.deleteMany({ where: { walletId: fixture.walletId } });
  await db.mobileMoneyRechargeAttempt.deleteMany({ where: { walletId: fixture.walletId } });
  await db.order.deleteMany({ where: { id: fixture.orderId } });
  await db.wallet.deleteMany({ where: { id: fixture.walletId } });
  await db.serviceDefinition.deleteMany({ where: { id: fixture.serviceId } });
}

test('mobile money recharge: confirmation atomically credits wallet, audit and outbox, then replays without a second credit', { skip: databaseUrl === undefined }, async () => {
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

    assert.equal(created.replayed, false);
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
    assert.equal(confirmed.attempt.status, 'WALLET_CREDITED');

    const balance = await db.walletBalance.findUnique({
      where: { walletId_currency: { walletId: f.walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 2_000n);
    assert.equal(await db.walletTransaction.count({ where: { walletId: f.walletId } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: attemptId } }), 1);
    assert.equal(await db.outboxMessage.count({ where: { aggregateId: f.walletId } }), 2);

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
  } finally {
    await cleanup(db, f, [createKey, confirmKey]);
    await db.$disconnect();
  }
});

test('mobile money recharge: montant ou devise discordants → MISMATCH sans crédit', { skip: databaseUrl === undefined }, async () => {
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
    assert.equal(await db.auditLog.count({ where: { entityId: String(created.attempt.id) } }), 1);
  } finally {
    await cleanup(db, f, [createKey, confirmKey]);
    await db.$disconnect();
  }
});
