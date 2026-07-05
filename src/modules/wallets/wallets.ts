import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export type WalletStatus = 'active' | 'inactive' | 'suspended' | 'archived';
export type WalletTransactionType = 'credit' | 'debit' | 'reservation' | 'release' | 'capture' | 'rollback';
export type WalletTransactionStatus = 'succeeded' | 'failed';
export type WalletReservationStatus = 'active' | 'released' | 'captured' | 'rolled_back';

export interface WalletBalance {
  readonly currency: string;
  readonly availableCents: number;
  readonly reservedCents: number;
  readonly updatedAt: string;
}

export interface WalletTransaction {
  readonly id: string;
  readonly walletId: string;
  readonly type: WalletTransactionType;
  readonly status: WalletTransactionStatus;
  readonly amountCents: number;
  readonly currency: string;
  readonly actorId: string;
  readonly transactionKey: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly reversalOfTransactionId: string | null;
  readonly reservationId: string | null;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WalletReservation {
  readonly id: string;
  readonly walletId: string;
  readonly status: WalletReservationStatus;
  readonly amountCents: number;
  readonly currency: string;
  readonly createdByTransactionId: string;
  readonly closedByTransactionId: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WalletAuditEvent {
  readonly id: string;
  readonly walletId: string;
  readonly transactionId: string;
  readonly action: string;
  readonly actorId: string;
  readonly outcome: WalletTransactionStatus;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface Wallet {
  readonly id: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly status: WalletStatus;
  readonly balances: readonly WalletBalance[];
  readonly transactions: readonly WalletTransaction[];
  readonly reservations: readonly WalletReservation[];
  readonly auditEvents: readonly WalletAuditEvent[];
  readonly processedTransactionKeys: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWalletInput {
  ownerType: string;
  ownerId: string;
  metadata?: Record<string, unknown>;
}

export interface WalletOperationInput {
  wallet: Wallet;
  amountCents: number;
  currency: string;
  actorId: string;
  transactionKey?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WalletReservationOperationInput {
  wallet: Wallet;
  reservationId: string;
  actorId: string;
  transactionKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface WalletRollbackInput {
  wallet: Wallet;
  transactionId: string;
  actorId: string;
  transactionKey?: string | null;
  metadata?: Record<string, unknown>;
}

function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`Le champ ${fieldName} est obligatoire`);
  return trimmed;
}

function normalizeCurrency(currency: string): string {
  const normalized = requireNonBlank(currency, 'currency').toUpperCase();
  if (normalized.length !== 3) throw new ValidationError('La devise wallet doit utiliser un code à trois caractères');
  return normalized;
}

function validateAmount(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('Le montant wallet doit être un entier strictement positif');
  }
  return amountCents;
}

function assertWalletActive(wallet: Wallet): void {
  if (wallet.status !== 'active') throw new ValidationError('Le wallet n’est pas actif');
}

function balanceFor(wallet: Wallet, currency: string): WalletBalance {
  return wallet.balances.find((balance) => balance.currency === currency) ?? Object.freeze({ currency, availableCents: 0, reservedCents: 0, updatedAt: wallet.updatedAt });
}

function replaceBalance(wallet: Wallet, nextBalance: WalletBalance): readonly WalletBalance[] {
  const balances = wallet.balances.filter((balance) => balance.currency !== nextBalance.currency);
  return Object.freeze([...balances, Object.freeze(nextBalance)].sort((left, right) => left.currency.localeCompare(right.currency)));
}

function immutableRecord(metadata?: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...(metadata ?? {}) });
}

function optionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function transactionKeyAlreadyProcessed(wallet: Wallet, transactionKey: string | null | undefined): boolean {
  return transactionKey !== undefined && transactionKey !== null && wallet.processedTransactionKeys.includes(transactionKey);
}

function appendTransactionKey(wallet: Wallet, transactionKey: string | null): readonly string[] {
  if (transactionKey === null || wallet.processedTransactionKeys.includes(transactionKey)) return wallet.processedTransactionKeys;
  return Object.freeze([...wallet.processedTransactionKeys, transactionKey]);
}

function makeTransaction(input: {
  walletId: string;
  type: WalletTransactionType;
  amountCents: number;
  currency: string;
  actorId: string;
  transactionKey: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  reversalOfTransactionId?: string | null;
  reservationId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}): WalletTransaction {
  return Object.freeze({
    id: randomUUID(),
    walletId: input.walletId,
    type: input.type,
    status: 'succeeded',
    amountCents: input.amountCents,
    currency: input.currency,
    actorId: input.actorId,
    transactionKey: input.transactionKey,
    relatedEntityType: optionalString(input.relatedEntityType),
    relatedEntityId: optionalString(input.relatedEntityId),
    reversalOfTransactionId: optionalString(input.reversalOfTransactionId),
    reservationId: optionalString(input.reservationId),
    occurredAt: input.occurredAt,
    metadata: immutableRecord(input.metadata),
  });
}

function makeAuditEvent(transaction: WalletTransaction, metadata?: Record<string, unknown>): WalletAuditEvent {
  return Object.freeze({
    id: randomUUID(),
    walletId: transaction.walletId,
    transactionId: transaction.id,
    action: `wallet.${transaction.type}`,
    actorId: transaction.actorId,
    outcome: transaction.status,
    occurredAt: transaction.occurredAt,
    metadata: immutableRecord(metadata),
  });
}

function freezeWallet(input: Omit<Wallet, 'balances' | 'transactions' | 'reservations' | 'auditEvents' | 'processedTransactionKeys'> & {
  balances: readonly WalletBalance[];
  transactions: readonly WalletTransaction[];
  reservations: readonly WalletReservation[];
  auditEvents: readonly WalletAuditEvent[];
  processedTransactionKeys: readonly string[];
}): Wallet {
  return Object.freeze({
    ...input,
    balances: Object.freeze([...input.balances]),
    transactions: Object.freeze([...input.transactions]),
    reservations: Object.freeze([...input.reservations]),
    auditEvents: Object.freeze([...input.auditEvents]),
    processedTransactionKeys: Object.freeze([...input.processedTransactionKeys]),
  });
}

function appendLedger(wallet: Wallet, input: { balance: WalletBalance; transaction: WalletTransaction; reservation?: WalletReservation | null; reservations?: readonly WalletReservation[]; transactionKey: string | null; auditMetadata?: Record<string, unknown>; now: string }): Wallet {
  return freezeWallet({
    ...wallet,
    balances: replaceBalance(wallet, input.balance),
    transactions: [...wallet.transactions, input.transaction],
    reservations: input.reservations ?? (input.reservation === undefined || input.reservation === null ? wallet.reservations : [...wallet.reservations, input.reservation]),
    auditEvents: [...wallet.auditEvents, makeAuditEvent(input.transaction, input.auditMetadata)],
    processedTransactionKeys: appendTransactionKey(wallet, input.transactionKey),
    updatedAt: input.now,
  });
}

function ensureNotDuplicate(wallet: Wallet, transactionKey: string | null): void {
  if (transactionKeyAlreadyProcessed(wallet, transactionKey)) throw new ValidationError('Transaction wallet déjà traitée');
}

function findReservation(wallet: Wallet, reservationId: string): WalletReservation {
  const reservation = wallet.reservations.find((candidate) => candidate.id === reservationId);
  if (reservation === undefined) throw new ValidationError('Réservation wallet introuvable');
  return reservation;
}

function replaceReservation(wallet: Wallet, reservation: WalletReservation): readonly WalletReservation[] {
  return Object.freeze(wallet.reservations.map((candidate) => (candidate.id === reservation.id ? reservation : candidate)));
}

export function createWallet(input: CreateWalletInput): Wallet {
  const now = new Date().toISOString();
  return freezeWallet({
    id: randomUUID(),
    ownerType: requireNonBlank(input.ownerType, 'ownerType'),
    ownerId: requireNonBlank(input.ownerId, 'ownerId'),
    status: 'active',
    balances: [],
    transactions: [],
    reservations: [],
    auditEvents: [],
    processedTransactionKeys: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function getWalletBalance(wallet: Wallet, currency: string): WalletBalance {
  return balanceFor(wallet, normalizeCurrency(currency));
}

export function hasAvailableFunds(wallet: Wallet, amountCents: number, currency: string): boolean {
  const amount = validateAmount(amountCents);
  const balance = getWalletBalance(wallet, currency);
  return balance.availableCents >= amount;
}

export function assertAvailableFunds(wallet: Wallet, amountCents: number, currency: string): void {
  if (!hasAvailableFunds(wallet, amountCents, currency)) throw new ValidationError('Solde wallet insuffisant');
}

export function creditWallet(input: WalletOperationInput): Wallet {
  assertWalletActive(input.wallet);
  const amount = validateAmount(input.amountCents);
  const currency = normalizeCurrency(input.currency);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, currency);
  const transaction = makeTransaction({ ...input, walletId: input.wallet.id, type: 'credit', amountCents: amount, currency, actorId, transactionKey, occurredAt: now });
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency, availableCents: current.availableCents + amount, reservedCents: current.reservedCents, updatedAt: now }),
    transaction,
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}

export function debitWallet(input: WalletOperationInput): Wallet {
  assertWalletActive(input.wallet);
  const amount = validateAmount(input.amountCents);
  const currency = normalizeCurrency(input.currency);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  assertAvailableFunds(input.wallet, amount, currency);
  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, currency);
  const transaction = makeTransaction({ ...input, walletId: input.wallet.id, type: 'debit', amountCents: amount, currency, actorId, transactionKey, occurredAt: now });
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency, availableCents: current.availableCents - amount, reservedCents: current.reservedCents, updatedAt: now }),
    transaction,
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}

export function reserveWalletFunds(input: WalletOperationInput): Wallet {
  assertWalletActive(input.wallet);
  const amount = validateAmount(input.amountCents);
  const currency = normalizeCurrency(input.currency);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  assertAvailableFunds(input.wallet, amount, currency);
  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, currency);
  const transaction = makeTransaction({ ...input, walletId: input.wallet.id, type: 'reservation', amountCents: amount, currency, actorId, transactionKey, occurredAt: now });
  const reservation: WalletReservation = Object.freeze({
    id: randomUUID(),
    walletId: input.wallet.id,
    status: 'active',
    amountCents: amount,
    currency,
    createdByTransactionId: transaction.id,
    closedByTransactionId: null,
    relatedEntityType: optionalString(input.relatedEntityType),
    relatedEntityId: optionalString(input.relatedEntityId),
    createdAt: now,
    updatedAt: now,
    metadata: immutableRecord(input.metadata),
  });
  const reservationTransaction = Object.freeze({ ...transaction, reservationId: reservation.id });
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency, availableCents: current.availableCents - amount, reservedCents: current.reservedCents + amount, updatedAt: now }),
    transaction: reservationTransaction,
    reservation,
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}

export function releaseWalletReservation(input: WalletReservationOperationInput): Wallet {
  assertWalletActive(input.wallet);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  const reservation = findReservation(input.wallet, requireNonBlank(input.reservationId, 'reservationId'));
  if (reservation.status !== 'active') throw new ValidationError('La réservation wallet n’est pas active');
  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, reservation.currency);
  const transaction = makeTransaction({ walletId: input.wallet.id, type: 'release', amountCents: reservation.amountCents, currency: reservation.currency, actorId, transactionKey, relatedEntityType: reservation.relatedEntityType, relatedEntityId: reservation.relatedEntityId, reservationId: reservation.id, metadata: input.metadata, occurredAt: now });
  const closedReservation = Object.freeze({ ...reservation, status: 'released' as const, closedByTransactionId: transaction.id, updatedAt: now });
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency: reservation.currency, availableCents: current.availableCents + reservation.amountCents, reservedCents: current.reservedCents - reservation.amountCents, updatedAt: now }),
    transaction,
    reservations: replaceReservation(input.wallet, closedReservation),
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}

export function captureWalletReservation(input: WalletReservationOperationInput): Wallet {
  assertWalletActive(input.wallet);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  const reservation = findReservation(input.wallet, requireNonBlank(input.reservationId, 'reservationId'));
  if (reservation.status !== 'active') throw new ValidationError('La réservation wallet n’est pas active');
  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, reservation.currency);
  const transaction = makeTransaction({ walletId: input.wallet.id, type: 'capture', amountCents: reservation.amountCents, currency: reservation.currency, actorId, transactionKey, relatedEntityType: reservation.relatedEntityType, relatedEntityId: reservation.relatedEntityId, reservationId: reservation.id, metadata: input.metadata, occurredAt: now });
  const closedReservation = Object.freeze({ ...reservation, status: 'captured' as const, closedByTransactionId: transaction.id, updatedAt: now });
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency: reservation.currency, availableCents: current.availableCents, reservedCents: current.reservedCents - reservation.amountCents, updatedAt: now }),
    transaction,
    reservations: replaceReservation(input.wallet, closedReservation),
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}

export function rollbackWalletTransaction(input: WalletRollbackInput): Wallet {
  assertWalletActive(input.wallet);
  const actorId = requireNonBlank(input.actorId, 'actorId');
  const transactionKey = optionalString(input.transactionKey);
  ensureNotDuplicate(input.wallet, transactionKey);
  const transactionToRollback = input.wallet.transactions.find((transaction) => transaction.id === input.transactionId);
  if (transactionToRollback === undefined) throw new ValidationError('Transaction wallet introuvable');
  if (transactionToRollback.type === 'rollback') throw new ValidationError('Une transaction de rollback ne peut pas être rollbackée');
  if (input.wallet.transactions.some((transaction) => transaction.reversalOfTransactionId === transactionToRollback.id)) {
    throw new ValidationError('Transaction wallet déjà rollbackée');
  }

  if (transactionToRollback.type === 'credit') {
    assertAvailableFunds(input.wallet, transactionToRollback.amountCents, transactionToRollback.currency);
  }

  if (transactionToRollback.type === 'reservation') {
    const reservation = transactionToRollback.reservationId === null ? null : findReservation(input.wallet, transactionToRollback.reservationId);
    if (reservation !== null && reservation.status === 'active') {
      return releaseWalletReservation({ wallet: input.wallet, reservationId: reservation.id, actorId, transactionKey, metadata: { ...(input.metadata ?? {}), rollbackOfTransactionId: transactionToRollback.id } });
    }
    throw new ValidationError('La réservation wallet ne peut pas être rollbackée dans son état actuel');
  }

  if (transactionToRollback.type === 'release') {
    throw new ValidationError('Une libération de réservation ne peut pas être rollbackée automatiquement');
  }

  const now = new Date().toISOString();
  const current = balanceFor(input.wallet, transactionToRollback.currency);
  const nextAvailable = transactionToRollback.type === 'credit'
    ? current.availableCents - transactionToRollback.amountCents
    : current.availableCents + transactionToRollback.amountCents;
  const nextReserved = transactionToRollback.type === 'capture'
    ? current.reservedCents
    : current.reservedCents;
  const rollback = makeTransaction({
    walletId: input.wallet.id,
    type: 'rollback',
    amountCents: transactionToRollback.amountCents,
    currency: transactionToRollback.currency,
    actorId,
    transactionKey,
    relatedEntityType: transactionToRollback.relatedEntityType,
    relatedEntityId: transactionToRollback.relatedEntityId,
    reversalOfTransactionId: transactionToRollback.id,
    reservationId: transactionToRollback.reservationId,
    metadata: input.metadata,
    occurredAt: now,
  });
  const rolledBackReservation = transactionToRollback.type === 'capture' && transactionToRollback.reservationId !== null
    ? Object.freeze({ ...findReservation(input.wallet, transactionToRollback.reservationId), status: 'rolled_back' as const, closedByTransactionId: rollback.id, updatedAt: now })
    : null;
  return appendLedger(input.wallet, {
    balance: Object.freeze({ currency: transactionToRollback.currency, availableCents: nextAvailable, reservedCents: nextReserved, updatedAt: now }),
    transaction: rollback,
    reservations: rolledBackReservation === null ? undefined : replaceReservation(input.wallet, rolledBackReservation),
    transactionKey,
    auditMetadata: input.metadata,
    now,
  });
}
