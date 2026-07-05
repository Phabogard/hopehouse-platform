import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderEngine } from '../src/modules/orders/index.js';
import {
  assertAvailableFunds,
  captureWalletReservation,
  createWallet,
  creditWallet,
  debitWallet,
  getWalletBalance,
  hasAvailableFunds,
  releaseWalletReservation,
  reserveWalletFunds,
  rollbackWalletTransaction,
  type Wallet,
} from '../src/modules/wallets/index.js';

test('wallet credit increases available balance and records immutable transaction and audit', () => {
  const wallet = createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' });
  const credited = creditWallet({ wallet, amountCents: 5000, currency: 'usd', actorId: 'actor-1', transactionKey: 'credit-1', metadata: { reason: 'initial-funding' } });
  const balance = getWalletBalance(credited, 'USD');

  assert.equal(balance.availableCents, 5000);
  assert.equal(balance.reservedCents, 0);
  assert.equal(credited.transactions.length, 1);
  assert.equal(credited.transactions[0]?.type, 'credit');
  assert.equal(credited.transactions[0]?.currency, 'USD');
  assert.equal(credited.auditEvents.length, 1);
  assert.equal(credited.auditEvents[0]?.action, 'wallet.credit');

  assert.throws(() => {
    (credited.transactions as unknown[]).push({});
  });
  assert.throws(() => {
    (credited.transactions[0]?.metadata as Record<string, unknown>).reason = 'mutated';
  });
});

test('wallet debit verifies available funds and refuses insufficient balance', () => {
  const wallet = creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 5000, currency: 'EUR', actorId: 'actor-1' });
  const debited = debitWallet({ wallet, amountCents: 1500, currency: 'eur', actorId: 'actor-2', transactionKey: 'debit-1' });

  assert.equal(getWalletBalance(debited, 'EUR').availableCents, 3500);
  assert.equal(hasAvailableFunds(debited, 3500, 'EUR'), true);
  assert.equal(hasAvailableFunds(debited, 3501, 'EUR'), false);
  assert.throws(() => assertAvailableFunds(debited, 3501, 'EUR'), /insuffisant/);
  assert.throws(() => debitWallet({ wallet: debited, amountCents: 3501, currency: 'EUR', actorId: 'actor-2' }), /insuffisant/);
});

test('wallet reservation moves available funds into reserved balance', () => {
  const wallet = creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 10_000, currency: 'GBP', actorId: 'actor-1' });
  const reserved = reserveWalletFunds({ wallet, amountCents: 4000, currency: 'GBP', actorId: 'actor-2', transactionKey: 'reserve-1', relatedEntityType: 'order', relatedEntityId: 'order-1' });
  const balance = getWalletBalance(reserved, 'GBP');

  assert.equal(balance.availableCents, 6000);
  assert.equal(balance.reservedCents, 4000);
  assert.equal(reserved.reservations.length, 1);
  assert.equal(reserved.reservations[0]?.status, 'active');
  assert.equal(reserved.transactions[1]?.type, 'reservation');
  assert.equal(reserved.transactions[1]?.reservationId, reserved.reservations[0]?.id);
});

test('wallet release returns active reservation to available balance', () => {
  const wallet = reserveWalletFunds({
    wallet: creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 8000, currency: 'CAD', actorId: 'actor-1' }),
    amountCents: 3000,
    currency: 'CAD',
    actorId: 'actor-2',
  });
  const reservationId = wallet.reservations[0]?.id ?? '';
  const released = releaseWalletReservation({ wallet, reservationId, actorId: 'actor-3', transactionKey: 'release-1' });
  const balance = getWalletBalance(released, 'CAD');

  assert.equal(balance.availableCents, 8000);
  assert.equal(balance.reservedCents, 0);
  assert.equal(released.reservations[0]?.status, 'released');
  assert.equal(released.transactions[2]?.type, 'release');
  assert.throws(() => releaseWalletReservation({ wallet: released, reservationId, actorId: 'actor-3' }), /active/);
});

test('wallet capture consumes reserved balance without returning it to available funds', () => {
  const wallet = reserveWalletFunds({
    wallet: creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 8000, currency: 'CHF', actorId: 'actor-1' }),
    amountCents: 3000,
    currency: 'CHF',
    actorId: 'actor-2',
  });
  const reservationId = wallet.reservations[0]?.id ?? '';
  const captured = captureWalletReservation({ wallet, reservationId, actorId: 'actor-3', transactionKey: 'capture-1' });
  const balance = getWalletBalance(captured, 'CHF');

  assert.equal(balance.availableCents, 5000);
  assert.equal(balance.reservedCents, 0);
  assert.equal(captured.reservations[0]?.status, 'captured');
  assert.equal(captured.transactions[2]?.type, 'capture');
});

test('wallet rollback reverses credit and debit exactly once', () => {
  const credited = creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 5000, currency: 'JPY', actorId: 'actor-1', transactionKey: 'credit-jpy' });
  const creditTransactionId = credited.transactions[0]?.id ?? '';
  const creditRolledBack = rollbackWalletTransaction({ wallet: credited, transactionId: creditTransactionId, actorId: 'auditor', transactionKey: 'rollback-credit' });

  assert.equal(getWalletBalance(creditRolledBack, 'JPY').availableCents, 0);
  assert.equal(creditRolledBack.transactions[1]?.type, 'rollback');
  assert.equal(creditRolledBack.transactions[1]?.reversalOfTransactionId, creditTransactionId);
  assert.throws(() => rollbackWalletTransaction({ wallet: creditRolledBack, transactionId: creditTransactionId, actorId: 'auditor' }), /déjà rollbackée/);

  const debited = debitWallet({ wallet: credited, amountCents: 2000, currency: 'JPY', actorId: 'actor-2', transactionKey: 'debit-jpy' });
  const debitTransactionId = debited.transactions[1]?.id ?? '';
  const debitRolledBack = rollbackWalletTransaction({ wallet: debited, transactionId: debitTransactionId, actorId: 'auditor', transactionKey: 'rollback-debit' });
  assert.equal(getWalletBalance(debitRolledBack, 'JPY').availableCents, 5000);
});

test('wallet rollback of an active reservation releases it', () => {
  const wallet = reserveWalletFunds({
    wallet: creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 7000, currency: 'AUD', actorId: 'actor-1' }),
    amountCents: 2500,
    currency: 'AUD',
    actorId: 'actor-2',
  });
  const reservationTransactionId = wallet.transactions[1]?.id ?? '';
  const rolledBack = rollbackWalletTransaction({ wallet, transactionId: reservationTransactionId, actorId: 'auditor', transactionKey: 'rollback-reservation' });

  assert.equal(getWalletBalance(rolledBack, 'AUD').availableCents, 7000);
  assert.equal(getWalletBalance(rolledBack, 'AUD').reservedCents, 0);
  assert.equal(rolledBack.reservations[0]?.status, 'released');
  assert.equal(rolledBack.transactions[2]?.type, 'release');
});


test('wallet rollback of a capture restores available funds and marks reservation rolled back', () => {
  const reserved = reserveWalletFunds({
    wallet: creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 6000, currency: 'NZD', actorId: 'actor-1' }),
    amountCents: 2000,
    currency: 'NZD',
    actorId: 'actor-2',
  });
  const captured = captureWalletReservation({ wallet: reserved, reservationId: reserved.reservations[0]?.id ?? '', actorId: 'actor-3' });
  const captureTransactionId = captured.transactions[2]?.id ?? '';
  const rolledBack = rollbackWalletTransaction({ wallet: captured, transactionId: captureTransactionId, actorId: 'auditor', transactionKey: 'rollback-capture' });

  assert.equal(getWalletBalance(rolledBack, 'NZD').availableCents, 6000);
  assert.equal(getWalletBalance(rolledBack, 'NZD').reservedCents, 0);
  assert.equal(rolledBack.reservations[0]?.status, 'rolled_back');
  assert.equal(rolledBack.transactions[3]?.type, 'rollback');
});

test('wallet rejects double transaction keys', () => {
  const wallet = creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 1000, currency: 'MXN', actorId: 'actor-1', transactionKey: 'unique-key' });

  assert.throws(() => creditWallet({ wallet, amountCents: 1000, currency: 'MXN', actorId: 'actor-1', transactionKey: 'unique-key' }), /déjà traitée/);
});

test('wallet supports multiple configurable currencies without a hardcoded currency list', () => {
  let wallet = createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' });
  wallet = creditWallet({ wallet, amountCents: 100, currency: 'AAA', actorId: 'actor-1' });
  wallet = creditWallet({ wallet, amountCents: 200, currency: 'BBB', actorId: 'actor-1' });

  assert.equal(getWalletBalance(wallet, 'AAA').availableCents, 100);
  assert.equal(getWalletBalance(wallet, 'BBB').availableCents, 200);
  assert.throws(() => creditWallet({ wallet, amountCents: 100, currency: 'US', actorId: 'actor-1' }), /devise/);
});

test('OrderEngine payment handler can reserve wallet funds without changing the order engine', async () => {
  let wallet: Wallet = creditWallet({ wallet: createWallet({ ownerType: 'configured-owner-type', ownerId: 'owner-1' }), amountCents: 9000, currency: 'USD', actorId: 'funding-actor' });
  let reservationId: string | null = null;
  const engine = new OrderEngine({
    payment: ({ order, actorId }) => {
      if (order.monetaryIntent === null) throw new Error('missing monetary intent');
      wallet = reserveWalletFunds({
        wallet,
        amountCents: order.monetaryIntent.amountCents,
        currency: order.monetaryIntent.currency,
        actorId,
        relatedEntityType: 'order',
        relatedEntityId: order.id,
        transactionKey: `payment-${order.id}`,
      });
      reservationId = wallet.reservations[0]?.id ?? null;
    },
  });

  const order = engine.create({ requesterActorId: 'actor-1', serviceDefinitionId: 'configured-service', mode: 'manual', monetaryIntent: { amountCents: 3000, currency: 'USD' } });
  const validated = await engine.advance({ order, actorId: 'actor-1', toStep: 'validation' });
  const paid = await engine.advance({ order: validated, actorId: 'actor-1', toStep: 'payment' });

  assert.equal(paid.currentStep, 'payment');
  assert.equal(getWalletBalance(wallet, 'USD').availableCents, 6000);
  assert.equal(getWalletBalance(wallet, 'USD').reservedCents, 3000);
  assert.equal(reservationId !== null, true);
  assert.equal(wallet.transactions[1]?.relatedEntityId, order.id);
});
