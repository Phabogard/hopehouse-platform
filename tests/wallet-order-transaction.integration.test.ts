import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaOrderRepository } from '../src/infrastructure/prisma/order-repository.js';
import { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';
import { PrismaAuditLogRepository } from '../src/infrastructure/prisma/audit-log-repository.js';
import { PostgresOutboxStore } from '../src/infrastructure/outbox/postgres-outbox-store.js';
import { ValidationError } from '../src/core/errors.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function createTestServiceAndCatalogItem(client: PrismaClient) {
  const serviceId = `svc-${randomUUID()}`;
  const catalogId = `cat-${randomUUID()}`;
  const catalogItemId = `item-${randomUUID()}`;

  await client.serviceDefinition.create({
    data: {
      id: serviceId,
      code: `CODE-${serviceId}`,
      name: 'Service Wallet Order Test',
      type: 'mobile_credit',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalog.create({
    data: {
      id: catalogId,
      code: `CAT-${catalogId}`,
      name: 'Catalogue Wallet Order Test',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalogItem.create({
    data: {
      id: catalogItemId,
      catalogId,
      serviceDefinitionId: serviceId,
      code: `ITEM-${catalogItemId}`,
      type: 'service',
      name: 'Item Wallet Order Test',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  return { serviceId, catalogItemId };
}

test('Wallet <-> Order transaction: A. Transaction Wallet scoped - shared Prisma transaction client', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const orderRepo = new PrismaOrderRepository(client);
  const walletRepo = new PrismaWalletRepository(client);

  try {
    const { serviceId, catalogItemId } = await createTestServiceAndCatalogItem(client);
    const wallet = await walletRepo.createWallet({ id: `w-${randomUUID()}`, ownerType: 'USER', ownerId: `u-${randomUUID()}` });

    // Initial credit of 10000 cents
    await walletRepo.credit({
      transactionId: `tx-init-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 10000,
      actorId: 'system',
    });

    // Execute Order creation + Wallet Debit in a single shared transaction
    const order = await client.$transaction(async (tx) => {
      const createdOrder = await orderRepo.create({
        serviceDefinitionId: serviceId,
        catalogItemId,
        mode: 'manual',
        requesterActorId: 'actor-1',
        amountCents: 2500,
        currency: 'EUR',
      }, tx);

      await walletRepo.debitWithinTransaction(tx, {
        transactionId: `tx-debit-${randomUUID()}`,
        walletId: wallet.id,
        currency: 'EUR',
        amountCents: 2500,
        actorId: 'actor-1',
        relatedEntityType: 'order',
        relatedEntityId: createdOrder.id,
      });

      return createdOrder;
    });

    assert.notEqual(order, null);
    assert.equal(order.currentStep, 'creation');

    const updatedWallet = await walletRepo.getWalletById(wallet.id);
    assert.equal(updatedWallet?.balances[0].availableCents, 7500);
  } finally {
    await client.$disconnect();
  }
});

test('Wallet <-> Order transaction: B. Atomic rollback - complete rollback on error before commit', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const orderRepo = new PrismaOrderRepository(client);
  const walletRepo = new PrismaWalletRepository(client);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const wallet = await walletRepo.createWallet({ id: `w-${randomUUID()}`, ownerType: 'USER', ownerId: `u-${randomUUID()}` });

    await walletRepo.credit({
      transactionId: `tx-init-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 10000,
      actorId: 'system',
    });

    const order = await orderRepo.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: 'actor-init',
    });

    const expectedErrorMsg = 'VOLUNTARY_SIMULATED_FAILURE_BEFORE_COMMIT';

    let errorThrown = false;
    try {
      await client.$transaction(async (tx) => {
        // 1. Advance order with lock
        await orderRepo.advanceWithLock({
          orderId: order.id,
          expectedFromStep: 'creation',
          toStep: 'validation',
          actorId: 'actor-1',
          beforeCommit: async (lockedOrder, innerTx) => {
            const txClient = innerTx as any;

            // 2. Debit wallet in same transaction
            await walletRepo.debitWithinTransaction(txClient, {
              transactionId: `tx-debit-${randomUUID()}`,
              walletId: wallet.id,
              currency: 'EUR',
              amountCents: 3000,
              actorId: 'actor-1',
              relatedEntityType: 'order',
              relatedEntityId: lockedOrder.id,
            });

            // 3. Write audit in same transaction
            const auditTxRepo = new PrismaAuditLogRepository(txClient);
            await auditTxRepo.record({
              id: `audit-${randomUUID()}`,
              actorUserId: 'actor-1',
              action: 'order.payment.debit',
              entityType: 'order',
              entityId: lockedOrder.id,
              outcome: 'success',
              occurredAt: new Date().toISOString(),
              metadata: { amountCents: 3000 },
            });

            // 4. Write outbox in same transaction
            const outboxTxStore = new PostgresOutboxStore(txClient);
            await outboxTxStore.append({
              eventId: `outbox-${randomUUID()}`,
              eventType: 'order.paid',
              schemaVersion: 1,
              occurredAt: new Date().toISOString(),
              correlationId: randomUUID(),
              causationId: null,
              aggregateType: 'order',
              aggregateId: lockedOrder.id,
              payload: { orderId: lockedOrder.id, walletId: wallet.id },
            });

            // 5. Simulate forced error before commit
            throw new Error(expectedErrorMsg);
          },
        }, tx);
      });
    } catch (err: any) {
      errorThrown = true;
      assert.equal(err.message, expectedErrorMsg);
    }

    assert.equal(errorThrown, true, 'An error should have been thrown');

    // VERIFY POSTGRESQL STATE: 0 changes persisted
    const reloadedOrder = await orderRepo.getById(order.id);
    assert.equal(reloadedOrder?.currentStep, 'creation', 'Order step must remain creation');
    assert.equal(reloadedOrder?.transitions.length, 1, 'Only initial transition must exist');

    const walletState = await walletRepo.getWalletById(wallet.id);
    assert.equal(walletState?.balances[0].availableCents, 10000, 'Wallet balance must remain 10000 cents');

    const txs = await client.walletTransaction.findMany({ where: { walletId: wallet.id } });
    assert.equal(txs.length, 1, 'Only initial credit transaction must exist in PostgreSQL');

    const auditCount = await client.auditLog.count({ where: { entityId: order.id } });
    assert.equal(auditCount, 0, 'Zero audit records should exist for the failed transition');

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: order.id } });
    assert.equal(outboxCount, 0, 'Zero outbox messages should exist for the failed transition');
  } finally {
    await client.$disconnect();
  }
});

test('Wallet <-> Order transaction: C. Atomic success - order transition + wallet debit + audit + outbox in single transaction', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const orderRepo = new PrismaOrderRepository(client);
  const walletRepo = new PrismaWalletRepository(client);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const wallet = await walletRepo.createWallet({ id: `w-${randomUUID()}`, ownerType: 'USER', ownerId: `u-${randomUUID()}` });

    await walletRepo.credit({
      transactionId: `tx-init-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 10000,
      actorId: 'system',
    });

    const order = await orderRepo.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: 'actor-init',
    });

    const debitTxId = `tx-debit-${randomUUID()}`;
    const auditId = `audit-${randomUUID()}`;
    const outboxId = `outbox-${randomUUID()}`;

    const advancedOrder = await client.$transaction(async (tx) => {
      return await orderRepo.advanceWithLock({
        orderId: order.id,
        expectedFromStep: 'creation',
        toStep: 'validation',
        actorId: 'actor-1',
        beforeCommit: async (lockedOrder, innerTx) => {
          const txClient = innerTx as any;

          await walletRepo.debitWithinTransaction(txClient, {
            transactionId: debitTxId,
            walletId: wallet.id,
            currency: 'EUR',
            amountCents: 4000,
            actorId: 'actor-1',
            relatedEntityType: 'order',
            relatedEntityId: lockedOrder.id,
          });

          const auditTxRepo = new PrismaAuditLogRepository(txClient);
          await auditTxRepo.record({
            id: auditId,
            actorUserId: 'actor-1',
            action: 'order.payment.debit',
            entityType: 'order',
            entityId: lockedOrder.id,
            outcome: 'success',
            occurredAt: new Date().toISOString(),
            metadata: { amountCents: 4000 },
          });

          const outboxTxStore = new PostgresOutboxStore(txClient);
          await outboxTxStore.append({
            eventId: outboxId,
            eventType: 'order.paid',
            schemaVersion: 1,
            occurredAt: new Date().toISOString(),
            correlationId: randomUUID(),
            causationId: null,
            aggregateType: 'order',
            aggregateId: lockedOrder.id,
            payload: { orderId: lockedOrder.id, walletId: wallet.id },
          });
        },
      }, tx);
    });

    assert.equal(advancedOrder.currentStep, 'validation');
    assert.equal(advancedOrder.transitions.length, 2);

    const walletState = await walletRepo.getWalletById(wallet.id);
    assert.equal(walletState?.balances[0].availableCents, 6000);

    const debitTxInDb = await walletRepo.getTransactionById(debitTxId);
    assert.notEqual(debitTxInDb, null);
    assert.equal(debitTxInDb?.amountCents, 4000);

    const auditInDb = await client.auditLog.findUnique({ where: { id: auditId } });
    assert.notEqual(auditInDb, null);
    assert.equal(auditInDb?.action, 'order.payment.debit');

    const outboxInDb = await client.outboxMessage.findUnique({ where: { id: outboxId } });
    assert.notEqual(outboxInDb, null);
    assert.equal(outboxInDb?.eventType, 'order.paid');
  } finally {
    await client.$disconnect();
  }
});

test('Wallet <-> Order transaction: D. Concurrence PostgreSQL & E. Insufficient funds - strictly 1 wins, no negative balance, pg_blocking_pids confirmed', { skip: databaseUrl === undefined }, async () => {
  const client1 = integrationClient();
  const client2 = integrationClient();
  const orderRepo1 = new PrismaOrderRepository(client1);
  const orderRepo2 = new PrismaOrderRepository(client2);
  const walletRepo1 = new PrismaWalletRepository(client1);
  const walletRepo2 = new PrismaWalletRepository(client2);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client1);

    // Initial wallet balance = 5000 cents
    const wallet = await walletRepo1.createWallet({ id: `w-${randomUUID()}`, ownerType: 'USER', ownerId: `u-${randomUUID()}` });
    await walletRepo1.credit({
      transactionId: `tx-init-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 5000,
      actorId: 'system',
    });

    // Two orders, each requesting a debit of 4000 cents (total 8000 cents required, but only 5000 available)
    const order1 = await orderRepo1.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: 'actor-1',
    });
    const order2 = await orderRepo1.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: 'actor-2',
    });

    const runConcurrentDebitOrder = async (repo: PrismaOrderRepository, walletRepo: PrismaWalletRepository, orderId: string, actorId: string, client: PrismaClient) => {
      return await client.$transaction(async (tx) => {
        // Sample pg_blocking_pids to verify actual PostgreSQL lock contention
        await tx.$queryRaw`SELECT pg_blocking_pids(pg_backend_pid()) AS blocking`;

        return await repo.advanceWithLock({
          orderId,
          expectedFromStep: 'creation',
          toStep: 'validation',
          actorId,
          beforeCommit: async (lockedOrder, innerTx) => {
            const txClient = innerTx as any;

            // Lock balance row FOR UPDATE before debit check
            await txClient.$queryRaw`
              SELECT wallet_id, currency, available_cents, reserved_cents
              FROM wallet_balances
              WHERE wallet_id = ${wallet.id} AND currency = 'EUR'
              FOR UPDATE
            `;

            await walletRepo.debitWithinTransaction(txClient, {
              transactionId: `tx-debit-${randomUUID()}`,
              walletId: wallet.id,
              currency: 'EUR',
              amountCents: 4000,
              actorId,
              relatedEntityType: 'order',
              relatedEntityId: lockedOrder.id,
            });
          },
        }, tx);
      }, { maxWait: 10000, timeout: 20000 });
    };

    const [res1, res2] = await Promise.allSettled([
      runConcurrentDebitOrder(orderRepo1, walletRepo1, order1.id, 'actor-1', client1),
      runConcurrentDebitOrder(orderRepo2, walletRepo2, order2.id, 'actor-2', client2),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly 1 concurrent order payment transaction must succeed');
    assert.equal(rejected.length, 1, 'Exactly 1 concurrent order payment transaction must be rejected');

    const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
    assert.equal(rejectedError instanceof ValidationError, true, 'Error must be a ValidationError');
    assert.match(rejectedError.message, /Insufficient available balance/i, 'Error must indicate insufficient balance');

    // Invariant verification: available balance must be exactly 1000 cents (5000 - 4000), NEVER negative
    const finalWalletState = await walletRepo1.getWalletById(wallet.id);
    assert.equal(finalWalletState?.balances[0].availableCents, 1000, 'Available cents must be 1000 (never negative)');

    // Verify orders state
    const o1 = await orderRepo1.getById(order1.id);
    const o2 = await orderRepo1.getById(order2.id);

    const advancedCount = [o1?.currentStep, o2?.currentStep].filter((s) => s === 'validation').length;
    const creationCount = [o1?.currentStep, o2?.currentStep].filter((s) => s === 'creation').length;

    assert.equal(advancedCount, 1, 'Exactly 1 order reached validation step');
    assert.equal(creationCount, 1, 'Exactly 1 order remained in creation step');
  } finally {
    await client1.$disconnect();
    await client2.$disconnect();
  }
});
