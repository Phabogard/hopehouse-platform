import { randomUUID } from 'node:crypto';
import type { MobileMoneyRechargeStatus, Prisma, PrismaClient } from '@prisma/client';
import { DomainError, ValidationError } from '../../core/errors.js';
import { PostgresIdempotencyStore } from '../../infrastructure/prisma/idempotency-store.js';
import { PrismaAuditLogRepository } from '../../infrastructure/prisma/audit-log-repository.js';
import { PostgresOutboxStore } from '../../infrastructure/outbox/postgres-outbox-store.js';
import { CreditWalletUseCase } from './credit-wallet-use-case.js';

const CREATE_OPERATION = 'wallet.recharge.create';

export class RechargeConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'RECHARGE_CONFLICT', 409);
  }
}

export interface CreateRechargeCommand {
  readonly orderId: string;
  readonly walletId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly network: string;
  readonly externalReference?: string;
  readonly metadata?: Record<string, unknown>;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

export interface ConfirmRechargeCommand {
  readonly attemptId: string;
  readonly walletId: string;
  readonly confirmedAmountCents: number;
  readonly confirmedCurrency: string;
  readonly externalReference?: string;
  readonly reviewMetadata?: Record<string, unknown>;
  readonly actorId: string;
  readonly idempotencyKey: string;
}

type RechargeClient = PrismaClient & {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
};

export interface MobileMoneyRechargeResult {
  readonly attempt: Record<string, unknown>;
  readonly replayed: boolean;
}

function validateAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError('Le montant doit être un entier positif exprimé en cents');
  }
}

function validateCurrency(value: string): void {
  if (!/^[A-Za-z]{3}$/.test(value)) {
    throw new ValidationError('La devise doit contenir exactement trois lettres');
  }
}

function validateNetwork(value: string): void {
  if (value.trim().length === 0) throw new ValidationError('Le réseau Mobile Money est obligatoire');
}

function isFinal(status: MobileMoneyRechargeStatus): boolean {
  return status === 'WALLET_CREDITED' || status === 'RECEIPT_ISSUED';
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

export class MobileMoneyRechargeUseCase {
  constructor(
    private readonly prisma: RechargeClient,
    private readonly idempotencyStore: PostgresIdempotencyStore,
    private readonly creditWallet: CreditWalletUseCase,
  ) {}

  async create(command: CreateRechargeCommand): Promise<MobileMoneyRechargeResult> {
    validateAmount(command.amountCents);
    validateCurrency(command.currency);
    validateNetwork(command.network);
    if (command.idempotencyKey.trim().length === 0) {
      throw new ValidationError("L'en-tête Idempotency-Key est obligatoire");
    }

    const existing = await this.idempotencyStore.find(command.idempotencyKey, CREATE_OPERATION);
    if (existing?.resultReference) {
      const attempt = await this.prisma.mobileMoneyRechargeAttempt.findUnique({
        where: { id: existing.resultReference },
      });
      if (attempt) return { attempt: attempt as unknown as Record<string, unknown>, replayed: true };
    }

    const attemptId = randomUUID();
    try {
      return await this.prisma.$transaction(async (tx) => {
      const store = new PostgresIdempotencyStore(tx);
      const won = await store.save({
        key: command.idempotencyKey,
        operation: CREATE_OPERATION,
        resultReference: attemptId,
        createdAt: new Date().toISOString(),
      });
      if (!won) {
        const winner = await store.find(command.idempotencyKey, CREATE_OPERATION);
        if (winner?.resultReference) {
          const attempt = await tx.mobileMoneyRechargeAttempt.findUnique({ where: { id: winner.resultReference } });
          if (attempt) return { attempt: attempt as unknown as Record<string, unknown>, replayed: true };
        }
        throw new Error('Recharge idempotency conflict without a retrievable result');
      }

      const [order, wallet] = await Promise.all([
        tx.order.findUnique({ where: { id: command.orderId }, select: { id: true, requesterActorId: true } }),
        tx.wallet.findUnique({ where: { id: command.walletId }, select: { id: true, ownerId: true, status: true } }),
      ]);
      if (!order) throw new ValidationError('Commande introuvable');
      if (!wallet) throw new ValidationError('Wallet introuvable');
      if (order.requesterActorId !== wallet.ownerId) {
        throw new RechargeConflictError('Le wallet ne correspond pas au demandeur de la commande');
      }
      if (wallet.status !== 'ACTIVE') {
        throw new RechargeConflictError('Le wallet n’est pas actif');
      }
      if (order.requesterActorId !== command.actorId) {
        throw new RechargeConflictError('La recharge doit être créée par le demandeur de la commande');
      }

      const attempt = await tx.mobileMoneyRechargeAttempt.create({
        data: {
          id: attemptId,
          orderId: command.orderId,
          walletId: command.walletId,
          requestedAmountCents: BigInt(command.amountCents),
          requestedCurrency: command.currency.toUpperCase(),
          network: command.network.trim(),
          status: 'RECONCILIATION_PENDING',
          externalReference: command.externalReference,
          detectedAt: new Date(),
          metadataJson: (command.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
        return { attempt: attempt as unknown as Record<string, unknown>, replayed: false };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error) && command.externalReference !== undefined) {
        throw new RechargeConflictError('La référence externe est déjà utilisée par une autre tentative de recharge');
      }
      throw error;
    }
  }

  async confirm(command: ConfirmRechargeCommand): Promise<MobileMoneyRechargeResult> {
    validateAmount(command.confirmedAmountCents);
    validateCurrency(command.confirmedCurrency);
    if (command.idempotencyKey.trim().length === 0) {
      throw new ValidationError("L'en-tête Idempotency-Key est obligatoire");
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "mobile_money_recharge_attempts"
        WHERE "id" = ${command.attemptId}
        FOR UPDATE
      `;
      if (rows.length === 0) throw new ValidationError('Tentative de recharge introuvable');

      const attempt = await tx.mobileMoneyRechargeAttempt.findUnique({ where: { id: command.attemptId } });
      if (!attempt) throw new ValidationError('Tentative de recharge introuvable');
      if (attempt.walletId !== command.walletId) {
        throw new RechargeConflictError('Le wallet de la route ne correspond pas à la tentative');
      }

      if (isFinal(attempt.status)) {
        const sameKey = await new PostgresIdempotencyStore(tx).find(
          command.idempotencyKey,
          `wallet.recharge.confirm:${attempt.id}`,
        );
        if (sameKey?.resultReference === attempt.id) {
          return { attempt: attempt as unknown as Record<string, unknown>, replayed: true };
        }
        throw new RechargeConflictError('Cette recharge a déjà crédité le wallet');
      }

      if (attempt.status !== 'RECONCILIATION_PENDING') {
        throw new RechargeConflictError(`La recharge est dans l’état ${attempt.status} et ne peut pas être confirmée`);
      }

      const confirmOperation = `wallet.recharge.confirm:${attempt.id}`;
      const idempotency = new PostgresIdempotencyStore(tx);
      const won = await idempotency.save({
        key: command.idempotencyKey,
        operation: confirmOperation,
        resultReference: attempt.id,
        createdAt: new Date().toISOString(),
      });
      if (!won) {
        const prior = await idempotency.find(command.idempotencyKey, confirmOperation);
        if (prior?.resultReference === attempt.id) {
          const current = await tx.mobileMoneyRechargeAttempt.findUnique({ where: { id: attempt.id } });
          if (current) return { attempt: current as unknown as Record<string, unknown>, replayed: true };
        }
        throw new RechargeConflictError('La clé d’idempotence est déjà utilisée pour une autre confirmation');
      }

      const requestedAmount = Number(attempt.requestedAmountCents);
      const requestedCurrency = attempt.requestedCurrency.toUpperCase();
      const confirmedCurrency = command.confirmedCurrency.toUpperCase();
      const reference = command.externalReference ?? attempt.externalReference;

      await tx.mobileMoneyRechargeAttempt.update({
        where: { id: attempt.id },
        data: {
          confirmedAmountCents: BigInt(command.confirmedAmountCents),
          confirmedCurrency,
          externalReference: reference,
          reviewedByActorId: command.actorId,
          reviewMetadataJson: (command.reviewMetadata ?? {}) as Prisma.InputJsonValue,
          confirmedAt: command.confirmedAmountCents === requestedAmount && confirmedCurrency === requestedCurrency ? new Date() : null,
          status: command.confirmedAmountCents === requestedAmount && confirmedCurrency === requestedCurrency ? 'CONFIRMED' : 'MISMATCH',
        },
      });

      if (command.confirmedAmountCents !== requestedAmount || confirmedCurrency !== requestedCurrency) {
        const audit = new PrismaAuditLogRepository(tx);
        await audit.record({
          id: randomUUID(),
          actorUserId: command.actorId,
          action: 'wallet.recharge.reconcile',
          entityType: 'mobile_money_recharge_attempt',
          entityId: attempt.id,
          outcome: 'failure',
          occurredAt: new Date().toISOString(),
          metadata: {
            reason: 'mismatch',
            requestedAmountCents: requestedAmount,
            confirmedAmountCents: command.confirmedAmountCents,
            requestedCurrency,
            confirmedCurrency,
          },
        });
        const current = await tx.mobileMoneyRechargeAttempt.findUnique({ where: { id: attempt.id } });
        return { attempt: current as unknown as Record<string, unknown>, replayed: false };
      }

      const credit = await this.creditWallet.executeWithinTransaction(tx, {
        walletId: attempt.walletId,
        currency: requestedCurrency,
        amountCents: requestedAmount,
        actorId: command.actorId,
        idempotencyKey: command.idempotencyKey,
        idempotencyOperation: `wallet.credit.recharge:${attempt.id}`,
        transactionKey: `recharge:${attempt.id}:credit`,
        relatedEntityType: 'mobile_money_recharge_attempt',
        relatedEntityId: attempt.id,
        correlationId: attempt.id,
        metadata: {
          rechargeAttemptId: attempt.id,
          externalReference: reference,
          network: attempt.network,
        },
      });

      const credited = await tx.mobileMoneyRechargeAttempt.update({
        where: { id: attempt.id },
        data: { status: 'WALLET_CREDITED' },
      });

      const audit = new PrismaAuditLogRepository(tx);
      await audit.record({
        id: randomUUID(),
        actorUserId: command.actorId,
        action: 'wallet.recharge.credit',
        entityType: 'mobile_money_recharge_attempt',
        entityId: attempt.id,
        outcome: 'success',
        occurredAt: new Date().toISOString(),
        metadata: {
          walletTransactionId: credit.transaction.id,
          amountCents: requestedAmount,
          currency: requestedCurrency,
          externalReference: reference,
        },
      });

      await new PostgresOutboxStore(tx).append({
        eventId: randomUUID(),
        eventType: 'wallet.recharge_credited',
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: attempt.id,
        causationId: null,
        aggregateId: attempt.walletId,
        aggregateType: 'wallet',
        payload: {
          rechargeAttemptId: attempt.id,
          walletId: attempt.walletId,
          transactionId: credit.transaction.id,
          amountCents: requestedAmount,
          currency: requestedCurrency,
          externalReference: reference,
        },
      });

      return { attempt: credited as unknown as Record<string, unknown>, replayed: credit.replayed };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error) && command.externalReference !== undefined) {
        throw new RechargeConflictError('La référence externe est déjà utilisée par une autre tentative de recharge');
      }
      throw error;
    }
  }
}
