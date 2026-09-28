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
