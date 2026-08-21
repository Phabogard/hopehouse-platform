import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PrismaWalletRepository,
  toSafeBigIntCents,
  fromSafeBigIntCents,
  validateCurrency,
} from '../src/modules/wallets/prisma-wallet-repository.js';
import {
  WalletStatus,
  WalletTransactionType,
  WalletTransactionStatus,
  WalletReservationStatus,
  type PrismaClient,
} from '@prisma/client';

// In-memory mock implementing strict PostgreSQL Option B composite foreign keys,
// unique constraints, and check constraints
function createMockPrismaClient() {
  const wallets = new Map<string, any>();
  const balances = new Map<string, any>(); // key: `${walletId}:${currency}`
  const transactions = new Map<string, any>();
  const reservations = new Map<string, any>();

  const client: any = {
    wallet: {
      async create({ data }: any) {
        // UNIQUE(owner_type, owner_id)
        for (const w of wallets.values()) {
          if (w.ownerType === data.ownerType && w.ownerId === data.ownerId) {
            const err: any = new Error('Unique constraint failed on the fields: (`owner_type`,`owner_id`)');
            err.code = 'P2002';
            throw err;
          }
        }
        const record = {
          ...data,
          status: data.status ?? WalletStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        wallets.set(data.id, record);
        return record;
      },
      async findUnique({ where, include }: any) {
        const wallet = wallets.get(where.id);
        if (!wallet) return null;
        if (include?.balances) {
          const wBalances = Array.from(balances.values()).filter((b) => b.walletId === wallet.id);
          return { ...wallet, balances: wBalances };
        }
        return wallet;
      },
    },
    walletBalance: {
      async findUnique({ where }: any) {
        const key = `${where.walletId_currency.walletId}:${where.walletId_currency.currency}`;
        return balances.get(key) ?? null;
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.walletId_currency.walletId}:${where.walletId_currency.currency}`;
        let balance = balances.get(key);
        if (!balance) {
          balance = {
            walletId: create.walletId,
            currency: create.currency,
            availableCents: create.availableCents ?? 0n,
            reservedCents: create.reservedCents ?? 0n,
            updatedAt: new Date(),
          };
        } else {
          if (update.availableCents?.increment) {
            balance.availableCents += update.availableCents.increment;
          }
          if (update.availableCents?.decrement) {
            balance.availableCents -= update.availableCents.decrement;
          }
          balance.updatedAt = new Date();
        }
        balances.set(key, balance);
        return balance;
      },
      async update({ where, data }: any) {
        const key = `${where.walletId_currency.walletId}:${where.walletId_currency.currency}`;
        const balance = balances.get(key);
        if (!balance) throw new Error('Balance not found');
        if (data.availableCents?.increment) {
          balance.availableCents += data.availableCents.increment;
        }
        if (data.availableCents?.decrement) {
          balance.availableCents -= data.availableCents.decrement;
        }
        if (data.reservedCents?.increment) {
          balance.reservedCents += data.reservedCents.increment;
        }
        if (data.reservedCents?.decrement) {
          balance.reservedCents -= data.reservedCents.decrement;
        }
        balance.updatedAt = new Date();
        balances.set(key, balance);
        return balance;
      },
    },
    walletTransaction: {
      async create({ data }: any) {
        // 1. UNIQUE(wallet_id, transaction_key) WHERE transaction_key IS NOT NULL
        if (data.transactionKey) {
          for (const tx of transactions.values()) {
            if (tx.walletId === data.walletId && tx.transactionKey === data.transactionKey) {
              const err: any = new Error('Unique constraint failed on the fields: (`wallet_id`,`transaction_key`)');
              err.code = 'P2002';
              err.meta = { target: ['walletId', 'transactionKey'] };
              throw err;
            }
          }
        }
        // 2. UNIQUE(wallet_id, reversal_of_transaction_id) WHERE reversal_of_transaction_id IS NOT NULL
        if (data.reversalOfTransactionId) {
          for (const tx of transactions.values()) {
            if (tx.walletId === data.walletId && tx.reversalOfTransactionId === data.reversalOfTransactionId) {
              const err: any = new Error('Unique constraint failed on the fields: (`wallet_id`,`reversal_of_transaction_id`)');
              err.code = 'P2002';
              err.meta = { target: ['walletId', 'reversalOfTransactionId'] };
              throw err;
            }
          }
          // OPTION B / Cross-Wallet Rollback FK Check: (wallet_id, reversal_of_transaction_id) REFERENCES (wallet_id, id)
          const target = transactions.get(data.reversalOfTransactionId);
          if (!target || target.walletId !== data.walletId) {
            const err: any = new Error('Foreign key constraint violation: SQLSTATE 23503');
            err.code = 'P2003';
            err.sqlState = '23503';
            throw err;
          }
        }

        const record = {
          ...data,
          occurredAt: new Date(),
        };
        transactions.set(data.id, record);
        return record;
      },
      async findFirst({ where }: any) {
        for (const tx of transactions.values()) {
          let match = true;
          if (where.walletId && tx.walletId !== where.walletId) match = false;
          if (where.transactionKey && tx.transactionKey !== where.transactionKey) match = false;
          if (where.reversalOfTransactionId && tx.reversalOfTransactionId !== where.reversalOfTransactionId) match = false;
          if (match) return tx;
        }
        return null;
      },
      async findUnique({ where }: any) {
        return transactions.get(where.id) ?? null;
      },
    },
    walletReservation: {
      async create({ data }: any) {
        // OPTION B FK Check 1: created_by_transaction (wallet_id, created_by_transaction_id) -> (wallet_id, id)
        const createdTx = transactions.get(data.createdByTransactionId);
        if (!createdTx || createdTx.walletId !== data.walletId) {
          const err: any = new Error('Foreign key constraint violation: SQLSTATE 23503');
          err.code = 'P2003';
          err.sqlState = '23503';
          throw err;
        }
        // OPTION B FK Check 2: closed_by_transaction (wallet_id, closed_by_transaction_id) -> (wallet_id, id) (if not null)
        if (data.closedByTransactionId !== null && data.closedByTransactionId !== undefined) {
          const closedTx = transactions.get(data.closedByTransactionId);
          if (!closedTx || closedTx.walletId !== data.walletId) {
            const err: any = new Error('Foreign key constraint violation: SQLSTATE 23503');
            err.code = 'P2003';
            err.sqlState = '23503';
            throw err;
          }
        }

        const record = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        reservations.set(data.id, record);
        return record;
      },
      async findUnique({ where }: any) {
        return reservations.get(where.id) ?? null;
      },
      async findFirst({ where }: any) {
        for (const res of reservations.values()) {
          let match = true;
          if (where.walletId && res.walletId !== where.walletId) match = false;
          if (where.createdByTransactionId && res.createdByTransactionId !== where.createdByTransactionId) match = false;
          if (match) return res;
        }
        return null;
      },
      async update({ where, data }: any) {
        const res = reservations.get(where.id);
        if (!res) throw new Error('Reservation not found');

        if (data.closedByTransactionId) {
          // OPTION B FK check on update
          const closedTx = transactions.get(data.closedByTransactionId);
          if (!closedTx || closedTx.walletId !== res.walletId) {
            const err: any = new Error('Foreign key constraint violation: SQLSTATE 23503');
            err.code = 'P2003';
            err.sqlState = '23503';
            throw err;
          }
          res.closedByTransactionId = data.closedByTransactionId;
        }
        if (data.status) {
          res.status = data.status;
        }
        res.updatedAt = new Date();
        reservations.set(where.id, res);
        return res;
      },
    },
    async $transaction(callback: (tx: any) => Promise<any>) {
      const createdWallets: string[] = [];
      const createdTransactions: string[] = [];
      const createdReservations: string[] = [];
      const balanceDeltas = new Map<string, { available: bigint; reserved: bigint; wasCreated?: boolean }>();
      const reservationPrevious = new Map<string, any>();

      const tx: any = {
        wallet: {
          ...client.wallet,
          async create({ data }: any) {
            const res = await client.wallet.create({ data });
            createdWallets.push(res.id);
            return res;
          },
        },
        walletBalance: {
          ...client.walletBalance,
          async upsert({ where, create, update }: any) {
            const key = `${where.walletId_currency.walletId}:${where.walletId_currency.currency}`;
            const existed = balances.has(key);
            const res = await client.walletBalance.upsert({ where, create, update });
            const delta = balanceDeltas.get(key) ?? { available: 0n, reserved: 0n, wasCreated: !existed };
            if (!existed) {
              delta.available += BigInt(create.availableCents ?? 0n);
              delta.reserved += BigInt(create.reservedCents ?? 0n);
            } else {
              if (update.availableCents?.increment) delta.available += BigInt(update.availableCents.increment);
              if (update.availableCents?.decrement) delta.available -= BigInt(update.availableCents.decrement);
              if (update.reservedCents?.increment) delta.reserved += BigInt(update.reservedCents.increment);
              if (update.reservedCents?.decrement) delta.reserved -= BigInt(update.reservedCents.decrement);
            }
            balanceDeltas.set(key, delta);
            return res;
          },
          async update({ where, data }: any) {
            const key = `${where.walletId_currency.walletId}:${where.walletId_currency.currency}`;
            const res = await client.walletBalance.update({ where, data });
            const delta = balanceDeltas.get(key) ?? { available: 0n, reserved: 0n };
            if (data.availableCents?.increment) delta.available += BigInt(data.availableCents.increment);
            if (data.availableCents?.decrement) delta.available -= BigInt(data.availableCents.decrement);
            if (data.reservedCents?.increment) delta.reserved += BigInt(data.reservedCents.increment);
            if (data.reservedCents?.decrement) delta.reserved -= BigInt(data.reservedCents.decrement);
            balanceDeltas.set(key, delta);
            return res;
          },
        },
        walletTransaction: {
          ...client.walletTransaction,
          async create({ data }: any) {
            const res = await client.walletTransaction.create({ data });
            createdTransactions.push(res.id);
            return res;
          },
        },
        walletReservation: {
          ...client.walletReservation,
          async create({ data }: any) {
            const res = await client.walletReservation.create({ data });
            createdReservations.push(res.id);
            return res;
          },
          async update({ where, data }: any) {
            if (!reservationPrevious.has(where.id)) {
              const current = reservations.get(where.id);
              if (current) reservationPrevious.set(where.id, { ...current });
            }
            return client.walletReservation.update({ where, data });
          },
        },
      };

      try {
        return await callback(tx);
      } catch (err) {
        // Rollback ONLY this transaction's changes
        for (const id of createdTransactions) transactions.delete(id);
        for (const id of createdReservations) reservations.delete(id);
        for (const id of createdWallets) wallets.delete(id);
        for (const [id, prev] of reservationPrevious) reservations.set(id, prev);
        for (const [key, delta] of balanceDeltas) {
          if (delta.wasCreated) {
            balances.delete(key);
          } else {
            const b = balances.get(key);
            if (b) {
              b.availableCents -= delta.available;
              b.reservedCents -= delta.reserved;
            }
          }
        }
        throw err;
      }
    },
  };

  return client as PrismaClient;
}

test('1. Safe Integer Boundary & Currency validation', () => {
  assert.equal(toSafeBigIntCents(1000), 1000n);
  assert.equal(fromSafeBigIntCents(1000n), 1000);
  assert.equal(validateCurrency('EUR'), 'EUR');

  assert.throws(() => toSafeBigIntCents(-100));
  assert.throws(() => toSafeBigIntCents(0));
  assert.throws(() => toSafeBigIntCents(Number.MAX_SAFE_INTEGER + 10));
  assert.throws(() => fromSafeBigIntCents(BigInt(Number.MAX_SAFE_INTEGER) + 100n));
  assert.throws(() => validateCurrency('euros'));
  assert.throws(() => validateCurrency('eu'));
});

test('2. Nominal same-wallet credit, debit, and reservation flow', async () => {
  const prisma = createMockPrismaClient();
  const repo = new PrismaWalletRepository(prisma);

  const wallet = await repo.createWallet({ id: 'w-1', ownerType: 'USER', ownerId: 'user-1' });
  assert.equal(wallet.id, 'w-1');
  assert.equal(wallet.status, 'ACTIVE');

  // Credit
  const creditTx = await repo.credit({
    transactionId: 'tx-credit-1',
    walletId: 'w-1',
    currency: 'EUR',
    amountCents: 10000,
    actorId: 'system',
    transactionKey: 'key-credit-1',
  });
  assert.equal(creditTx.amountCents, 10000);
  assert.equal(creditTx.type, 'CREDIT');

  const state1 = await repo.getWalletById('w-1');
  assert.equal(state1?.balances[0].availableCents, 10000);
  assert.equal(state1?.balances[0].reservedCents, 0);

  // Reservation
  const { transaction: holdTx, reservation } = await repo.reserve({
    reservationId: 'res-1',
    transactionId: 'tx-hold-1',
    walletId: 'w-1',
    currency: 'EUR',
    amountCents: 4000,
    actorId: 'system',
    transactionKey: 'key-res-1',
  });
  assert.equal(holdTx.type, 'RESERVATION_HOLD');
  assert.equal(reservation.status, 'ACTIVE');
  assert.equal(reservation.closedByTransactionId, null);

  const state2 = await repo.getWalletById('w-1');
  assert.equal(state2?.balances[0].availableCents, 6000);
  assert.equal(state2?.balances[0].reservedCents, 4000);

  // Release
  const { reservation: releasedRes } = await repo.releaseReservation({
    reservationId: 'res-1',
    transactionId: 'tx-release-1',
    walletId: 'w-1',
    actorId: 'system',
  });
  assert.equal(releasedRes.status, 'RELEASED');
  assert.equal(releasedRes.closedByTransactionId, 'tx-release-1');

  const state3 = await repo.getWalletById('w-1');
  assert.equal(state3?.balances[0].availableCents, 10000);
  assert.equal(state3?.balances[0].reservedCents, 0);
});

test('3. OPTION B: Cross-wallet creation rejected by DB foreign key constraint (SQLSTATE 23503)', async () => {
  const prisma = createMockPrismaClient();

  // Create two wallets and a transaction in W2
  await prisma.wallet.create({ data: { id: 'W1', ownerType: 'USER', ownerId: 'u1' } });
  await prisma.wallet.create({ data: { id: 'W2', ownerType: 'USER', ownerId: 'u2' } });

  await prisma.walletTransaction.create({
    data: {
      id: 'TX_W2',
      walletId: 'W2',
      currency: 'EUR',
      amountCents: 5000n,
      type: WalletTransactionType.CREDIT,
      status: WalletTransactionStatus.SETTLED,
      actorId: 'system',
      metadataJson: {},
    },
  });

  // Attempt to create reservation on W1 referencing TX_W2 belonging to W2
  await assert.rejects(
    async () => {
      await prisma.walletReservation.create({
        data: {
          id: 'RES_INVALID',
          walletId: 'W1', // W1 != W2
          currency: 'EUR',
          amountCents: 5000n,
          status: WalletReservationStatus.ACTIVE,
          createdByTransactionId: 'TX_W2',
          closedByTransactionId: null,
          metadataJson: {},
        },
      });
    },
    (err: any) => err.code === 'P2003' || err.sqlState === '23503'
  );
});

test('4. OPTION B: Cross-wallet rollback rejected by composite foreign key (SQLSTATE 23503)', async () => {
  const prisma = createMockPrismaClient();

  await prisma.wallet.create({ data: { id: 'W1', ownerType: 'USER', ownerId: 'u1' } });
  await prisma.wallet.create({ data: { id: 'W2', ownerType: 'USER', ownerId: 'u2' } });

  await prisma.walletTransaction.create({
    data: {
      id: 'TX_ORIGINAL_W1',
      walletId: 'W1',
      currency: 'EUR',
      amountCents: 5000n,
      type: WalletTransactionType.CREDIT,
      status: WalletTransactionStatus.SETTLED,
      actorId: 'system',
      metadataJson: {},
    },
  });

  // Attempt to create rollback on W2 pointing to TX of W1
  await assert.rejects(
    async () => {
      await prisma.walletTransaction.create({
        data: {
          id: 'TX_ROLLBACK_W2',
          walletId: 'W2', // W2 != W1
          currency: 'EUR',
          amountCents: 5000n,
          type: WalletTransactionType.ROLLBACK,
          status: WalletTransactionStatus.SETTLED,
          actorId: 'system',
          reversalOfTransactionId: 'TX_ORIGINAL_W1',
          metadataJson: {},
        },
      });
    },
    (err: any) => err.code === 'P2003' || err.sqlState === '23503'
  );
});

test('5. Concurrent Idempotence: N concurrent calls with same transactionKey create exactly 1 transaction', async () => {
  const prisma = createMockPrismaClient();
  const repo = new PrismaWalletRepository(prisma);

  await repo.createWallet({ id: 'w-concurrent', ownerType: 'USER', ownerId: 'u-conc' });

  // 10 concurrent credits with identical key
  const promises = Array.from({ length: 10 }).map((_, i) =>
    repo.credit({
      transactionId: `tx-conc-${i}`,
      walletId: 'w-concurrent',
      currency: 'EUR',
      amountCents: 5000,
      actorId: 'system',
      transactionKey: 'shared-idempotency-key',
    })
  );

  const results = await Promise.all(promises);
  assert.equal(results.length, 10);

  // All results return the exact same transaction ID
  const firstTxId = results[0].id;
  for (const r of results) {
    assert.equal(r.id, firstTxId);
    assert.equal(r.amountCents, 5000);
  }

  // Balance has only been mutated ONCE
  const state = await repo.getWalletById('w-concurrent');
  assert.equal(state?.balances[0].availableCents, 5000);
});

test('6. Rollback idempotence: cannot rollback a transaction twice', async () => {
  const prisma = createMockPrismaClient();
  const repo = new PrismaWalletRepository(prisma);

  await repo.createWallet({ id: 'w-rb', ownerType: 'USER', ownerId: 'u-rb' });
  await repo.credit({
    transactionId: 'tx-credit-initial',
    walletId: 'w-rb',
    currency: 'EUR',
    amountCents: 10000,
    actorId: 'system',
  });

  const debitTx = await repo.debit({
    transactionId: 'tx-debit-to-reverse',
    walletId: 'w-rb',
    currency: 'EUR',
    amountCents: 3000,
    actorId: 'system',
  });

  const rb1 = await repo.rollbackTransaction({
    rollbackTransactionId: 'tx-rollback-1',
    targetTransactionId: debitTx.id,
    walletId: 'w-rb',
    actorId: 'system',
  });
  assert.equal(rb1.type, 'ROLLBACK');

  // Second rollback must be rejected
  await assert.rejects(async () => {
    await repo.rollbackTransaction({
      rollbackTransactionId: 'tx-rollback-2',
      targetTransactionId: debitTx.id,
      walletId: 'w-rb',
      actorId: 'system',
    });
  });
});

test('7. P2002 strict classification: TEST A — transactionKey meta.target triggers idempotence resolution', async () => {
  const prisma = createMockPrismaClient();
  const repo = new PrismaWalletRepository(prisma);

  await repo.createWallet({ id: 'w-p2002-a', ownerType: 'USER', ownerId: 'u-p2002-a' });

  // Initial successful transaction
  const initialTx = await repo.credit({
    transactionId: 'tx-winner',
    walletId: 'w-p2002-a',
    currency: 'EUR',
    amountCents: 5000,
    actorId: 'system',
    transactionKey: 'key-a',
  });

  // Inject a mock transaction that throws P2002 on create with meta.target = ['walletId', 'transactionKey']
  const throwingPrisma = {
    ...prisma,
    $transaction: async () => {
      const err: any = new Error('Unique constraint failed on the fields: (`wallet_id`,`transaction_key`)');
      err.code = 'P2002';
      err.meta = { target: ['walletId', 'transactionKey'] };
      throw err;
    },
  };

  const repoWithThrow = new PrismaWalletRepository(throwingPrisma as any);
  const resolved = await repoWithThrow.credit({
    transactionId: 'tx-loser',
    walletId: 'w-p2002-a',
    currency: 'EUR',
    amountCents: 5000,
    actorId: 'system',
    transactionKey: 'key-a',
  });

  assert.equal(resolved.id, initialTx.id);
  assert.equal(resolved.amountCents, 5000);
});

test('8. P2002 strict classification: TEST B — reversalOfTransactionId meta.target propagates error', async () => {
  const prisma = createMockPrismaClient();
  await prisma.wallet.create({ id: 'w-p2002-b', ownerType: 'USER', ownerId: 'u-b', status: 'ACTIVE' });

  const throwingPrisma = {
    ...prisma,
    $transaction: async () => {
      const err: any = new Error('Unique constraint failed on the fields: (`wallet_id`,`reversal_of_transaction_id`)');
      err.code = 'P2002';
      err.meta = { target: ['walletId', 'reversalOfTransactionId'] };
      throw err;
    },
  };

  const repo = new PrismaWalletRepository(throwingPrisma as any);

  await assert.rejects(
    async () => {
      await repo.credit({
        transactionId: 'tx-b',
        walletId: 'w-p2002-b',
        currency: 'EUR',
        amountCents: 1000,
        actorId: 'system',
        transactionKey: 'key-b',
      });
    },
    (err: any) => {
      assert.equal(err.code, 'P2002');
      assert.deepEqual(err.meta?.target, ['walletId', 'reversalOfTransactionId']);
      return true;
    }
  );
});

test('9. P2002 strict classification: TEST C — other constraint meta.target (id) propagates error', async () => {
  const prisma = createMockPrismaClient();
  await prisma.wallet.create({ id: 'w-p2002-c', ownerType: 'USER', ownerId: 'u-c', status: 'ACTIVE' });

  const throwingPrisma = {
    ...prisma,
    $transaction: async () => {
      const err: any = new Error('Unique constraint failed on the fields: (`id`)');
      err.code = 'P2002';
      err.meta = { target: ['id'] };
      throw err;
    },
  };

  const repo = new PrismaWalletRepository(throwingPrisma as any);

  await assert.rejects(
    async () => {
      await repo.credit({
        transactionId: 'tx-c',
        walletId: 'w-p2002-c',
        currency: 'EUR',
        amountCents: 1000,
        actorId: 'system',
        transactionKey: 'key-c',
      });
    },
    (err: any) => {
      assert.equal(err.code, 'P2002');
      assert.deepEqual(err.meta?.target, ['id']);
      return true;
    }
  );
});

test('10. P2002 strict classification: TEST D — missing target propagates error', async () => {
  const prisma = createMockPrismaClient();
  await prisma.wallet.create({ id: 'w-p2002-d', ownerType: 'USER', ownerId: 'u-d', status: 'ACTIVE' });

  const throwingPrisma = {
    ...prisma,
    $transaction: async () => {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    },
  };

  const repo = new PrismaWalletRepository(throwingPrisma as any);

  await assert.rejects(
    async () => {
      await repo.credit({
        transactionId: 'tx-d',
        walletId: 'w-p2002-d',
        currency: 'EUR',
        amountCents: 1000,
        actorId: 'system',
        transactionKey: 'key-d',
      });
    },
    (err: any) => {
      assert.equal(err.code, 'P2002');
      assert.equal(err.meta, undefined);
      return true;
    }
  );
});
