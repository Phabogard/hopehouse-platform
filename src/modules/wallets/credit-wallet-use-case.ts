import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { ValidationError, DomainError } from '../../core/errors.js';
import type { IdempotencyStore } from '../../core/idempotency/idempotency.js';
import type { OutboxStore } from '../../core/outbox/outbox.js';
import { createWalletCreditedEvent, type WalletCreditedPayload } from './wallet-events.js';
import {
  PrismaWalletRepository,
  type WalletTransactionDto,
} from './prisma-wallet-repository.js';

const CREDIT_WALLET_OPERATION = 'wallet.credit';

/**
 * Same 'WALLET_CONFLICT' code and 409 status as prisma-wallet-repository.ts's
 * WalletConflictError (the project's existing conflict-error convention for
 * this domain) — declared here instead of imported from there so this
 * use-case module has no runtime dependency on @prisma/client (only
 * PrismaWalletRepository, the actual Prisma-backed implementation, does).
 */
export class TransactionKeyConflictError extends DomainError {
  constructor(walletId: string, transactionKey: string) {
    super(
      `transactionKey "${transactionKey}" is already used by a different operation on wallet ${walletId}`,
      'WALLET_CONFLICT',
      409,
    );
  }
}

/**
 * Command accepted by CreditWalletUseCase.
 *
 * Two distinct identifiers are involved, with two distinct responsibilities:
 *
 * - `idempotencyKey`: idempotence of the *command* (the API call). It is
 *   mandatory, supplied by the caller (HTTP `Idempotency-Key` header), and
 *   is what a client retries with unchanged after a timeout or a dropped
 *   response. It is recorded as an `IdempotencyRecord` (key, operation).
 *
 * - `transactionKey`: uniqueness of the *financial movement* inside the
 *   Wallet domain (existing mechanism, enforced by a partial unique index
 *   on `wallet_transactions (wallet_id, transaction_key)`). It is optional
 *   and caller-supplied when the caller has its own business-level
 *   deduplication key (e.g. an external payment provider's reference).
 *
 * `transactionKey` is NEVER derived from `idempotencyKey`. If the caller
 * does not supply one, it is stored as NULL. Definitive rule for this
 * domain:
 *
 *   same transactionKey + same idempotencyKey    → idempotent replay, success
 *   same transactionKey + different idempotencyKey → business collision, TransactionKeyConflictError
 */
export interface CreditWalletCommand {
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly idempotencyOperation?: string;
  readonly transactionKey?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly correlationId?: string;
}

export interface CreditWalletResult {
  readonly transaction: WalletTransactionDto;
  /** true when this call returned a previously recorded result instead of crediting again. */
  readonly replayed: boolean;
}

type WalletCreditTransactionClient = Prisma.TransactionClient;

export interface CreditWalletDependencies {
  readonly prisma: {
    $transaction<T>(fn: (tx: WalletCreditTransactionClient) => Promise<T>): Promise<T>;
  };
  readonly walletRepository: PrismaWalletRepository;
  readonly idempotencyStore: IdempotencyStore;
  readonly createIdempotencyStore: (tx: WalletCreditTransactionClient) => IdempotencyStore;
  readonly createOutboxStore: (tx: WalletCreditTransactionClient) => OutboxStore<WalletCreditedPayload>;
}

/**
 * Even when this call's own IdempotencyRecord insert wins (a fresh
 * idempotencyKey), the Wallet mutation itself can discover a *different*
 * pre-existing WalletTransaction sharing the same caller-supplied business
 * `transactionKey` (i.e. a different, earlier idempotencyKey already
 * performed a movement under that same business reference). Per the
 * project's definitive rule:
 *
 *   same transactionKey + same idempotencyKey  → idempotent replay, success
 *   same transactionKey + different idempotencyKey → business collision, error
 *
 * This is always a genuine collision, never something to repair or paper
 * over: by the time this check runs, the IdempotencyRecord win already
 * proved this is a brand-new command, so any transactionKey collision found
 * here — however it is detected (a pre-existing row spotted by
 * creditWithinTransaction's own read, or a raw P2002 from a real
 * concurrent race, see isWalletTransactionKeyConflict below) — means two
 * different commands are fighting over the same business reference.
 * Throwing TransactionKeyConflictError aborts the whole transaction: the
 * speculative IdempotencyRecord insert above is rolled back with it, so the
 * losing idempotencyKey is left completely clean and can be retried (with a
 * different transactionKey) without being "burned".
 */
function isWalletTransactionKeyConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const candidate = err as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== 'P2002') return false;
  return (
    Array.isArray(candidate.meta?.target) &&
    candidate.meta.target.length === 2 &&
    (candidate.meta.target[0] === 'walletId' || candidate.meta.target[0] === 'wallet_id') &&
    (candidate.meta.target[1] === 'transactionKey' || candidate.meta.target[1] === 'transaction_key')
  );
}

function validateAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError(`Le montant doit être un entier positif exprimé en cents : reçu ${amountCents}`);
  }
}

export class CreditWalletUseCase {
  constructor(private readonly deps: CreditWalletDependencies) {}

  async execute(command: CreditWalletCommand): Promise<CreditWalletResult> {
    const operation = command.idempotencyOperation ?? CREDIT_WALLET_OPERATION;
    if (command.idempotencyKey.trim().length === 0) {
      throw new ValidationError("L'en-tête Idempotency-Key est obligatoire pour un crédit de wallet");
    }
    validateAmount(command.amountCents);

    const existingRecord = await this.deps.idempotencyStore.find(command.idempotencyKey, operation);
    if (existingRecord?.resultReference) {
      const existingTransaction = await this.deps.walletRepository.getTransactionById(existingRecord.resultReference);
      if (existingTransaction) return { transaction: existingTransaction, replayed: true };
    }

    try {
      return await this.deps.prisma.$transaction(async (tx) =>
        this.executeWithinTransaction(tx, command),
      );
    } catch (err) {
      if (isWalletTransactionKeyConflict(err) && command.transactionKey) {
        throw new TransactionKeyConflictError(command.walletId, command.transactionKey);
      }
      throw err;
    }
  }

  async executeWithinTransaction(
    tx: WalletCreditTransactionClient,
    command: CreditWalletCommand,
  ): Promise<CreditWalletResult> {
    const operation = command.idempotencyOperation ?? CREDIT_WALLET_OPERATION;
    if (command.idempotencyKey.trim().length === 0) {
      throw new ValidationError("L'en-tête Idempotency-Key est obligatoire pour un crédit de wallet");
    }
    validateAmount(command.amountCents);

    const idempotencyStore = this.deps.createIdempotencyStore(tx);
    const reservedTransactionId = randomUUID();
    const won = await idempotencyStore.save({
      key: command.idempotencyKey,
      operation,
      resultReference: reservedTransactionId,
      createdAt: new Date().toISOString(),
    });

    if (!won) {
      const existing = await idempotencyStore.find(command.idempotencyKey, operation);
      if (existing?.resultReference) {
        const existingTransaction = await this.deps.walletRepository.getTransactionById(existing.resultReference);
        if (existingTransaction) return { transaction: existingTransaction, replayed: true };
      }
      throw new Error(
        `IdempotencyRecord conflict for key=${command.idempotencyKey} operation=${operation} but no retrievable prior result was found`,
      );
    }

    const walletTransaction = await this.deps.walletRepository.creditWithinTransaction(tx, {
      transactionId: reservedTransactionId,
      walletId: command.walletId,
      currency: command.currency,
      amountCents: command.amountCents,
      actorId: command.actorId,
      transactionKey: command.transactionKey,
      relatedEntityType: command.relatedEntityType,
      relatedEntityId: command.relatedEntityId,
      metadata: command.metadata,
    });

    if (walletTransaction.id !== reservedTransactionId) {
      throw new TransactionKeyConflictError(command.walletId, command.transactionKey as string);
    }

    const outboxStore = this.deps.createOutboxStore(tx);
    const event = createWalletCreditedEvent({
      eventId: randomUUID(),
      occurredAt: walletTransaction.occurredAt,
      correlationId: command.correlationId ?? command.idempotencyKey,
      causationId: null,
      payload: {
        walletId: walletTransaction.walletId,
        transactionId: walletTransaction.id,
        currency: walletTransaction.currency,
        amountCents: walletTransaction.amountCents,
        actorId: walletTransaction.actorId,
        relatedEntityType: walletTransaction.relatedEntityType,
        relatedEntityId: walletTransaction.relatedEntityId,
      },
    });
    await outboxStore.append(event);

    return { transaction: walletTransaction, replayed: false };
  }
}
