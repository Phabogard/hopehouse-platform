import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaOrderRepository } from '../src/infrastructure/prisma/order-repository.js';
import { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';
import { OrderEngine } from '../src/modules/orders/order-engine.js';
import { PostgresIdempotencyStore } from '../src/infrastructure/prisma/idempotency-store.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function createService(client: PrismaClient): Promise<string> {
  const serviceId = `svc-${randomUUID()}`;
  await client.serviceDefinition.create({
    data: {
      id: serviceId,
      code: `CODE-${serviceId}`,
      name: 'Order Payment Idempotency Test',
      type: 'mobile_credit',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });
  return serviceId;
}

test('Order payment: concurrent requests with the same Idempotency-Key execute one reservation and replay the committed order', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const orderRepo = new PrismaOrderRepository(client);
  const walletRepo = new PrismaWalletRepository(client);
  const idempotencyStore = new PostgresIdempotencyStore(client);

  try {
    const serviceId = await createService(client);
    const requesterId = `u-${randomUUID()}`;
    const wallet = await walletRepo.createWallet({
      id: `w-${randomUUID()}`,
      ownerType: 'USER',
      ownerId: requesterId,
    });

    await walletRepo.credit({
      transactionId: `tx-init-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 10_000,
      actorId: 'system',
    });

    const order = await orderRepo.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: requesterId,
      amountCents: 4_000,
      currency: 'EUR',
    });

    let handlerCalls = 0;
    const engine = new OrderEngine({
      payment: async ({ order: lockedOrder, actorId, tx }) => {
        handlerCalls += 1;
        await walletRepo.reserveWithinTransaction(tx as any, {
          reservationId: randomUUID(),
          transactionId: randomUUID(),
          walletId: wallet.id,
          currency: lockedOrder.monetaryIntent!.currency,
          amountCents: lockedOrder.monetaryIntent!.amountCents,
          actorId,
          transactionKey: `order:${lockedOrder.id}:payment`,
          relatedEntityType: 'order',
          relatedEntityId: lockedOrder.id,
          metadata: { orderId: lockedOrder.id, step: 'payment' },
        });
      },
    }, orderRepo, {
      prisma: client,
      idempotencyStore,
      createIdempotencyStore: (tx) => new PostgresIdempotencyStore(tx as any),
    });

    const validated = await engine.advance({
      order,
      actorId: requesterId,
      toStep: 'validation',
    });

    const key = `payment-${randomUUID()}`;
    const [first, second] = await Promise.all([
      engine.advance({ order: validated, actorId: requesterId, toStep: 'payment', idempotencyKey: key }),
      engine.advance({ order: validated, actorId: requesterId, toStep: 'payment', idempotencyKey: key }),
    ]);

    assert.equal(first.currentStep, 'payment');
    assert.equal(second.currentStep, 'payment');
    assert.equal(first.id, second.id);
    assert.equal(handlerCalls, 1);

    const transitionCount = await client.orderTransition.count({
      where: { orderId: order.id, toStep: 'payment' },
    });
    assert.equal(transitionCount, 1);

    const reservationCount = await client.walletTransaction.count({
      where: { walletId: wallet.id, type: 'RESERVATION_HOLD' },
    });
    assert.equal(reservationCount, 1);

    const state = await walletRepo.getWalletById(wallet.id);
    assert.equal(state?.balances[0]?.availableCents, 6_000);
    assert.equal(state?.balances[0]?.reservedCents, 4_000);
  } finally {
    await client.$disconnect();
  }
});
