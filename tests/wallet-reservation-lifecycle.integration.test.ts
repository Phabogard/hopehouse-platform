import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function setupReservation(repo: PrismaWalletRepository) {
  const wallet = await repo.createWallet({
    id: `w-${randomUUID()}`,
    ownerType: 'USER',
    ownerId: `u-${randomUUID()}`,
  });

  await repo.credit({
    transactionId: `tx-credit-${randomUUID()}`,
    walletId: wallet.id,
    currency: 'EUR',
    amountCents: 10_000,
    actorId: 'system',
  });

  const held = await repo.reserve({
    reservationId: `res-${randomUUID()}`,
    transactionId: `tx-hold-${randomUUID()}`,
    walletId: wallet.id,
    currency: 'EUR',
    amountCents: 4_000,
    actorId: 'system',
    transactionKey: `hold-${randomUUID()}`,
  });

  return { wallet, reservation: held.reservation };
}

test('wallet reservation lifecycle: concurrent release and capture serialize on the reservation row', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaWalletRepository(client);

  try {
    const { wallet, reservation } = await setupReservation(repo);

    const results = await Promise.allSettled([
      repo.releaseReservation({
        reservationId: reservation.id,
        transactionId: `tx-release-${randomUUID()}`,
        walletId: wallet.id,
        actorId: 'system',
        transactionKey: `release-${randomUUID()}`,
      }),
      repo.captureReservation({
        reservationId: reservation.id,
        transactionId: `tx-capture-${randomUUID()}`,
        walletId: wallet.id,
        actorId: 'system',
        transactionKey: `capture-${randomUUID()}`,
      }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);

    const state = await repo.getWalletById(wallet.id);
    assert.equal(state?.balances[0]?.availableCents, 6_000);
    assert.equal(state?.balances[0]?.reservedCents, 0);

    const persistedReservation = await client.walletReservation.findUnique({
      where: { id: reservation.id },
    });
    assert.ok(persistedReservation);
    assert.ok(['RELEASED', 'CAPTURED'].includes(persistedReservation.status));

    const lifecycleTransactions = await client.walletTransaction.count({
      where: {
        walletId: wallet.id,
        type: { in: ['RESERVATION_RELEASE', 'RESERVATION_CAPTURE'] },
      },
    });
    assert.equal(lifecycleTransactions, 1);
  } finally {
    await client.$disconnect();
  }
});

test('wallet reservation lifecycle: same idempotency key cannot replay against another reservation', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaWalletRepository(client);

  try {
    const first = await setupReservation(repo);
    const second = await setupReservation(repo);

    await repo.releaseReservation({
      reservationId: first.reservation.id,
      transactionId: `tx-release-${randomUUID()}`,
      walletId: first.wallet.id,
      actorId: 'system',
      transactionKey: 'shared-release-key',
    });

    await assert.rejects(
      () => repo.releaseReservation({
        reservationId: second.reservation.id,
        transactionId: `tx-release-replay-${randomUUID()}`,
        walletId: first.wallet.id,
        actorId: 'system',
        transactionKey: 'shared-release-key',
      }),
      /does not match the requested reservation release|Reservation not found|Cross-wallet invariant/,
    );
  } finally {
    await client.$disconnect();
  }
});


test('wallet rollback: concurrent rollback attempts on the same target serialize and reverse exactly once', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaWalletRepository(client);

  try {
    const wallet = await repo.createWallet({
      id: `w-${randomUUID()}`,
      ownerType: 'USER',
      ownerId: `u-${randomUUID()}`,
    });

    await repo.credit({
      transactionId: `tx-credit-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 10_000,
      actorId: 'system',
    });

    const debit = await repo.debit({
      transactionId: `tx-debit-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 3_000,
      actorId: 'system',
    });

    const results = await Promise.allSettled([
      repo.rollbackTransaction({
        rollbackTransactionId: `tx-rb-${randomUUID()}`,
        targetTransactionId: debit.id,
        walletId: wallet.id,
        actorId: 'system',
      }),
      repo.rollbackTransaction({
        rollbackTransactionId: `tx-rb-${randomUUID()}`,
        targetTransactionId: debit.id,
        walletId: wallet.id,
        actorId: 'system',
      }),
    ]);

    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);

    const state = await repo.getWalletById(wallet.id);
    assert.equal(state?.balances[0]?.availableCents, 10_000);

    const rollbackCount = await client.walletTransaction.count({
      where: { walletId: wallet.id, type: 'ROLLBACK', reversalOfTransactionId: debit.id },
    });
    assert.equal(rollbackCount, 1);
  } finally {
    await client.$disconnect();
  }
});

test('wallet rollback: captured reservation restores available balance and closes reservation as rolled back', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaWalletRepository(client);

  try {
    const { wallet, reservation } = await setupReservation(repo);

    await repo.captureReservation({
      reservationId: reservation.id,
      transactionId: `tx-capture-${randomUUID()}`,
      walletId: wallet.id,
      actorId: 'system',
      transactionKey: `capture-${randomUUID()}`,
    });

    const beforeRollback = await repo.getWalletById(wallet.id);
    assert.equal(beforeRollback?.balances[0]?.availableCents, 6_000);
    assert.equal(beforeRollback?.balances[0]?.reservedCents, 0);

    const capture = await client.walletTransaction.findFirstOrThrow({
      where: { walletId: wallet.id, type: 'RESERVATION_CAPTURE' },
    });

    const rollback = await repo.rollbackTransaction({
      rollbackTransactionId: `tx-rb-${randomUUID()}`,
      targetTransactionId: capture.id,
      walletId: wallet.id,
      actorId: 'system',
    });
    assert.equal(rollback.type, 'ROLLBACK');

    const state = await repo.getWalletById(wallet.id);
    assert.equal(state?.balances[0]?.availableCents, 10_000);
    assert.equal(state?.balances[0]?.reservedCents, 0);

    const persistedReservation = await client.walletReservation.findUnique({
      where: { id: reservation.id },
    });
    assert.equal(persistedReservation?.status, 'ROLLED_BACK');
    assert.equal(persistedReservation?.closedByTransactionId, rollback.id);
  } finally {
    await client.$disconnect();
  }
});

test('wallet rollback: frozen wallet is rejected before any balance mutation', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaWalletRepository(client);

  try {
    const wallet = await repo.createWallet({
      id: `w-${randomUUID()}`,
      ownerType: 'USER',
      ownerId: `u-${randomUUID()}`,
    });

    await repo.credit({
      transactionId: `tx-credit-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 5_000,
      actorId: 'system',
    });

    const debit = await repo.debit({
      transactionId: `tx-debit-${randomUUID()}`,
      walletId: wallet.id,
      currency: 'EUR',
      amountCents: 1_000,
      actorId: 'system',
    });

    await client.wallet.update({
      where: { id: wallet.id },
      data: { status: 'FROZEN' },
    });

    await assert.rejects(
      () => repo.rollbackTransaction({
        rollbackTransactionId: `tx-rb-${randomUUID()}`,
        targetTransactionId: debit.id,
        walletId: wallet.id,
        actorId: 'system',
      }),
      /Wallet is not active/,
    );

    const state = await repo.getWalletById(wallet.id);
    assert.equal(state?.balances[0]?.availableCents, 4_000);

    const rollbackCount = await client.walletTransaction.count({
      where: { walletId: wallet.id, type: 'ROLLBACK', reversalOfTransactionId: debit.id },
    });
    assert.equal(rollbackCount, 0);
  } finally {
    await client.$disconnect();
  }
});
