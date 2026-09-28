import { PrismaClient, Prisma, WalletStatus, WalletTransactionType, WalletTransactionStatus, WalletReservationStatus } from '@prisma/client';
import { DomainError, ValidationError } from '../../core/errors.js';

export class WalletNotFoundError extends DomainError {
  constructor(message = 'Wallet not found') {
    super(message, 'WALLET_NOT_FOUND', 404);
  }
}

export class WalletConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'WALLET_CONFLICT', 409);
  }
}

export interface WalletBalanceDto {
  readonly currency: string;
  readonly availableCents: number;
  readonly reservedCents: number;
  readonly updatedAt: string;
}

export interface WalletDto {
  readonly id: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly status: WalletStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WalletTransactionDto {
  readonly id: string;
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly type: WalletTransactionType;
  readonly status: WalletTransactionStatus;
  readonly actorId: string;
  readonly transactionKey: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly reversalOfTransactionId: string | null;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WalletReservationDto {
  readonly id: string;
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly status: WalletReservationStatus;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly createdByTransactionId: string;
  readonly closedByTransactionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WalletStateDto {
  readonly wallet: WalletDto;
  readonly balances: readonly WalletBalanceDto[];
}

export interface CreateWalletParams {
  readonly id: string;
  readonly ownerType: string;
  readonly ownerId: string;
}

export interface CreditWalletParams {
  readonly transactionId: string;
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface DebitWalletParams {
  readonly transactionId: string;
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReserveWalletParams {
  readonly reservationId: string;
  readonly transactionId: string;
  readonly walletId: string;
  readonly currency: string;
  readonly amountCents: number;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReleaseReservationParams {
  readonly reservationId: string;
  readonly transactionId: string;
  readonly walletId: string;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface CaptureReservationParams {
  readonly reservationId: string;
  readonly transactionId: string;
  readonly walletId: string;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RollbackTransactionParams {
  readonly rollbackTransactionId: string;
  readonly targetTransactionId: string;
  readonly walletId: string;
  readonly actorId: string;
  readonly transactionKey?: string;
  readonly metadata?: Record<string, unknown>;
}

// Validation des entiers sûrs (Safe Integer Barrier)
export function toSafeBigIntCents(cents: number): bigint {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents <= 0) {
    throw new ValidationError(`Amount must be a positive safe integer in cents: received ${cents}`);
  }
  return BigInt(cents);
}

export function fromSafeBigIntCents(cents: bigint): number {
  const num = Number(cents);
  if (!Number.isSafeInteger(num) || num < 0) {
    throw new ValidationError(`Database BigInt value ${cents} is outside JavaScript safe integer range`);
  }
  return num;
}

export function validateCurrency(currency: string): string {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ValidationError(`Currency must match ISO 4217 3 uppercase letters: received '${currency}'`);
  }
  return currency;
}

function isTransactionKeyUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const candidate = err as {
    code?: unknown;
    meta?: {
      target?: unknown;
    };
  };

  if (candidate.code !== 'P2002') return false;

  return (
    Array.isArray(candidate.meta?.target) &&
    candidate.meta.target.length === 2 &&
    candidate.meta.target[0] === 'walletId' &&
    candidate.meta.target[1] === 'transactionKey'
  );
}

export class PrismaWalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private assertIdempotentTransaction(
    existingTx: WalletTransactionDto,
    expected: {
      type: WalletTransactionType;
      amountCents?: number;
      currency?: string;
      targetTransactionId?: string;
    },
    transactionKey: string,
  ): void {
    const typeMatches = existingTx.type === expected.type;
    const amountMatches = expected.amountCents === undefined || existingTx.amountCents === expected.amountCents;
    const currencyMatches = expected.currency === undefined || existingTx.currency === expected.currency;
    const targetMatches =
      expected.targetTransactionId === undefined ||
      existingTx.reversalOfTransactionId === expected.targetTransactionId;

    if (!typeMatches || !amountMatches || !currencyMatches || !targetMatches) {
      throw new WalletConflictError(
        `Transaction key ${transactionKey} does not match the requested wallet operation`,
      );
    }
  }

  async createWallet(params: CreateWalletParams): Promise<WalletDto> {
    const created = await this.prisma.wallet.create({
      data: {
        id: params.id,
        ownerType: params.ownerType,
        ownerId: params.ownerId,
        status: WalletStatus.ACTIVE,
      },
    });

    return Object.freeze({
      id: created.id,
      ownerType: created.ownerType,
      ownerId: created.ownerId,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  }

  async getWalletById(walletId: string): Promise<WalletStateDto | null> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: { balances: true },
    });

    if (!wallet) return null;

    return Object.freeze({
      wallet: Object.freeze({
        id: wallet.id,
        ownerType: wallet.ownerType,
        ownerId: wallet.ownerId,
        status: wallet.status,
        createdAt: wallet.createdAt.toISOString(),
        updatedAt: wallet.updatedAt.toISOString(),
      }),
      balances: Object.freeze(
        wallet.balances.map((b) =>
          Object.freeze({
            currency: b.currency,
            availableCents: fromSafeBigIntCents(b.availableCents),
            reservedCents: fromSafeBigIntCents(b.reservedCents),
            updatedAt: b.updatedAt.toISOString(),
          })
        )
      ),
    });
  }

  async getTransactionById(transactionId: string): Promise<WalletTransactionDto | null> {
    const transaction = await this.prisma.walletTransaction.findUnique({
      where: { id: transactionId },
    });
    return transaction === null ? null : this.mapTransaction(transaction);
  }

  async findTransactionByKey(walletId: string, transactionKey: string): Promise<WalletTransactionDto | null> {
    const transaction = await this.prisma.walletTransaction.findFirst({
      where: { walletId, transactionKey },
    });
    return transaction === null ? null : this.mapTransaction(transaction);
  }

  async credit(params: CreditWalletParams, externalTx?: Prisma.TransactionClient): Promise<WalletTransactionDto> {
    if (externalTx) {
      return this.creditWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, {
          type: WalletTransactionType.CREDIT, amountCents: params.amountCents, currency: validateCurrency(params.currency),
        }, params.transactionKey);
        return mapped;
      }
    }

    try {
      return await this.prisma.$transaction((tx) => this.creditWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const mapped = this.mapTransaction(winnerTx);
          this.assertIdempotentTransaction(mapped, {
            type: WalletTransactionType.CREDIT, amountCents: params.amountCents, currency: validateCurrency(params.currency),
          }, params.transactionKey);
          return mapped;
        }
      }
      throw err;
    }
  }

  async creditWithinTransaction(
    tx: Prisma.TransactionClient,
    params: CreditWalletParams,
  ): Promise<WalletTransactionDto> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, {
          type: WalletTransactionType.CREDIT,
          amountCents: params.amountCents,
          currency,
        }, params.transactionKey);
        return mapped;
      }
    }

    await tx.walletBalance.upsert({
      where: {
        walletId_currency: { walletId: params.walletId, currency },
      },
      create: {
        walletId: params.walletId,
        currency,
        availableCents: amountBigInt,
        reservedCents: 0n,
      },
      update: {
        availableCents: { increment: amountBigInt },
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        id: params.transactionId,
        walletId: params.walletId,
        currency,
        amountCents: amountBigInt,
        type: WalletTransactionType.CREDIT,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return this.mapTransaction(transaction);
  }

  async debit(params: DebitWalletParams, externalTx?: Prisma.TransactionClient): Promise<WalletTransactionDto> {
    if (externalTx) {
      return this.debitWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, {
          type: WalletTransactionType.DEBIT, amountCents: params.amountCents, currency: validateCurrency(params.currency),
        }, params.transactionKey);
        return mapped;
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.debitWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const mapped = this.mapTransaction(winnerTx);
          this.assertIdempotentTransaction(mapped, {
            type: WalletTransactionType.CREDIT,
            amountCents: params.amountCents,
            currency: validateCurrency(params.currency),
          }, params.transactionKey);
          return mapped;
        }
      }
      throw err;
    }
  }

  async debitWithinTransaction(
    tx: Prisma.TransactionClient,
    params: DebitWalletParams,
  ): Promise<WalletTransactionDto> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, {
          type: WalletTransactionType.DEBIT,
          amountCents: params.amountCents,
          currency,
        }, params.transactionKey);
        return mapped;
      }
    }

    await this.lockActiveWallet(tx, params.walletId);

    const lockedBalance = await tx.$queryRaw<Array<{
      wallet_id: string;
      currency: string;
      available_cents: bigint;
      reserved_cents: bigint;
    }>>`
      SELECT wallet_id, currency, available_cents, reserved_cents
      FROM wallet_balances
      WHERE wallet_id = ${params.walletId} AND currency = ${currency}
      FOR UPDATE
    `;

    const balance = lockedBalance[0];
    if (!balance || balance.available_cents < amountBigInt) {
      throw new ValidationError(
        `Insufficient available balance in ${currency}: requested ${params.amountCents}, available ${balance ? fromSafeBigIntCents(balance.available_cents) : 0}`
      );
    }

    await tx.walletBalance.update({
      where: { walletId_currency: { walletId: params.walletId, currency } },
      data: {
        availableCents: { decrement: amountBigInt },
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        id: params.transactionId,
        walletId: params.walletId,
        currency,
        amountCents: amountBigInt,
        type: WalletTransactionType.DEBIT,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return this.mapTransaction(transaction);
  }

  async reserve(
    params: ReserveWalletParams,
    externalTx?: Prisma.TransactionClient
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (externalTx) {
      return this.reserveWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findFirst({
          where: { walletId: params.walletId, createdByTransactionId: existingTx.id },
        });
        if (!reservation) throw new WalletConflictError(`Transaction key ${params.transactionKey} has no persisted reservation for the requested hold`);
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_HOLD, amountCents: params.amountCents, currency: validateCurrency(params.currency) }, params.transactionKey);
        return { transaction: mapped, reservation: this.mapReservation(reservation) };
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.reserveWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const reservation = await this.prisma.walletReservation.findFirst({
            where: { walletId: params.walletId, createdByTransactionId: winnerTx.id },
          });
          if (reservation) {
            return {
              transaction: this.mapTransaction(winnerTx),
              reservation: this.mapReservation(reservation),
            };
          }
        }
      }
      throw err;
    }
  }

  private async lockActiveWallet(tx: Prisma.TransactionClient, walletId: string): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string; status: WalletStatus }>>`
      SELECT id, status
      FROM wallets
      WHERE id = ${walletId}
      FOR UPDATE
    `;

    const wallet = rows[0];
    if (!wallet) {
      throw new WalletNotFoundError(`Wallet not found: ${walletId}`);
    }
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new WalletConflictError(`Wallet is not active (current status: ${wallet.status})`);
    }
  }

  async reserveWithinTransaction(
    tx: Prisma.TransactionClient,
    params: ReserveWalletParams,
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    await this.lockActiveWallet(tx, params.walletId);

    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, {
          type: WalletTransactionType.RESERVATION_HOLD,
          amountCents: params.amountCents,
          currency,
        }, params.transactionKey);
        const reservation = await tx.walletReservation.findFirst({
          where: { walletId: params.walletId, createdByTransactionId: existingTx.id },
        });
        if (reservation) {
          return {
            transaction: mapped,
            reservation: this.mapReservation(reservation),
          };
        }
        throw new WalletConflictError(`Transaction key ${params.transactionKey} has no reservation for the persisted hold`);
      }
    }

    const lockedBalance = await tx.$queryRaw<Array<{
      wallet_id: string;
      currency: string;
      available_cents: bigint;
      reserved_cents: bigint;
    }>>`
      SELECT wallet_id, currency, available_cents, reserved_cents
      FROM wallet_balances
      WHERE wallet_id = ${params.walletId} AND currency = ${currency}
      FOR UPDATE
    `;

    const balance = lockedBalance[0];
    if (!balance || balance.available_cents < amountBigInt) {
      throw new ValidationError(
        `Insufficient available balance in ${currency} for reservation: requested ${params.amountCents}, available ${balance ? fromSafeBigIntCents(balance.available_cents) : 0}`
      );
    }

    await tx.walletBalance.update({
      where: { walletId_currency: { walletId: params.walletId, currency } },
      data: {
        availableCents: { decrement: amountBigInt },
        reservedCents: { increment: amountBigInt },
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        id: params.transactionId,
        walletId: params.walletId,
        currency,
        amountCents: amountBigInt,
        type: WalletTransactionType.RESERVATION_HOLD,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    const reservation = await tx.walletReservation.create({
      data: {
        id: params.reservationId,
        walletId: params.walletId,
        currency,
        amountCents: amountBigInt,
        status: WalletReservationStatus.ACTIVE,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        createdByTransactionId: transaction.id,
        closedByTransactionId: null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return {
      transaction: this.mapTransaction(transaction),
      reservation: this.mapReservation(reservation),
    };
  }

  private async lockReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
  ): Promise<{
    id: string;
    walletId: string;
    currency: string;
    amountCents: bigint;
    status: WalletReservationStatus;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    createdByTransactionId: string;
    closedByTransactionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadataJson: Prisma.JsonValue;
  }> {
    const rows = await tx.$queryRaw<Array<{
      id: string;
      wallet_id: string;
      currency: string;
      amount_cents: bigint;
      status: WalletReservationStatus;
      related_entity_type: string | null;
      related_entity_id: string | null;
      created_by_transaction_id: string;
      closed_by_transaction_id: string | null;
      created_at: Date;
      updated_at: Date;
      metadata_json: Prisma.JsonValue;
    }>>`
      SELECT id, wallet_id, currency, amount_cents, status, related_entity_type, related_entity_id,
             created_by_transaction_id, closed_by_transaction_id, created_at, updated_at, metadata_json
      FROM wallet_reservations
      WHERE id = ${reservationId}
      FOR UPDATE
    `;

    const reservation = rows[0];
    if (!reservation) {
      throw new WalletNotFoundError(`Reservation not found: ${reservationId}`);
    }

    return {
      id: reservation.id,
      walletId: reservation.wallet_id,
      currency: reservation.currency,
      amountCents: reservation.amount_cents,
      status: reservation.status,
      relatedEntityType: reservation.related_entity_type,
      relatedEntityId: reservation.related_entity_id,
      createdByTransactionId: reservation.created_by_transaction_id,
      closedByTransactionId: reservation.closed_by_transaction_id,
      createdAt: reservation.created_at,
      updatedAt: reservation.updated_at,
      metadataJson: reservation.metadata_json,
    };
  }

  async releaseReservation(
    params: ReleaseReservationParams,
    externalTx?: Prisma.TransactionClient
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (externalTx) {
      return this.releaseReservationWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findUnique({ where: { id: params.reservationId } });
        if (!reservation || reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release`);
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_RELEASE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
        if (reservation.closedByTransactionId !== existingTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release`);
        return { transaction: mapped, reservation: this.mapReservation(reservation) };
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.releaseReservationWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const reservation = await this.prisma.walletReservation.findUnique({
            where: { id: params.reservationId },
          });
          if (reservation) {
            if (reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release wallet`);
            const mapped = this.mapTransaction(winnerTx);
            this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_RELEASE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
            if (reservation.closedByTransactionId !== winnerTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release`);
            return { transaction: mapped, reservation: this.mapReservation(reservation) };
          }
        }
      }
      throw err;
    }
  }

  async releaseReservationWithinTransaction(
    tx: Prisma.TransactionClient,
    params: ReleaseReservationParams,
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await tx.walletReservation.findUnique({ where: { id: params.reservationId } });
        if (!reservation || reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release`);
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_RELEASE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
        if (reservation.closedByTransactionId !== existingTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation release`);
        return { transaction: mapped, reservation: this.mapReservation(reservation) };
      }
    }

    const reservation = await this.lockReservation(tx, params.reservationId);

    if (!reservation) {
      throw new WalletNotFoundError(`Reservation not found: ${params.reservationId}`);
    }

    if (reservation.walletId !== params.walletId) {
      throw new ValidationError(`Cross-wallet invariant violation: reservation belongs to ${reservation.walletId}, operation on ${params.walletId}`);
    }

    if (reservation.status !== WalletReservationStatus.ACTIVE) {
      throw new WalletConflictError(`Reservation is not active (current status: ${reservation.status})`);
    }

    await tx.walletBalance.update({
      where: {
        walletId_currency: { walletId: params.walletId, currency: reservation.currency },
      },
      data: {
        reservedCents: { decrement: reservation.amountCents },
        availableCents: { increment: reservation.amountCents },
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        id: params.transactionId,
        walletId: params.walletId,
        currency: reservation.currency,
        amountCents: fromSafeBigIntCents(reservation.amountCents),
        type: WalletTransactionType.RESERVATION_RELEASE,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    const updatedReservation = await tx.walletReservation.update({
      where: { id: reservation.id },
      data: {
        status: WalletReservationStatus.RELEASED,
        closedByTransactionId: transaction.id,
      },
    });

    return {
      transaction: this.mapTransaction(transaction),
      reservation: this.mapReservation(updatedReservation),
    };
  }

  async captureReservation(
    params: CaptureReservationParams,
    externalTx?: Prisma.TransactionClient
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (externalTx) {
      return this.captureReservationWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findUnique({ where: { id: params.reservationId } });
        if (!reservation || reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture`);
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_CAPTURE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
        if (reservation.closedByTransactionId !== existingTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture`);
        return { transaction: mapped, reservation: this.mapReservation(reservation) };
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.captureReservationWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const reservation = await this.prisma.walletReservation.findUnique({
            where: { id: params.reservationId },
          });
          if (reservation) {
            if (reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture wallet`);
            const mapped = this.mapTransaction(winnerTx);
            this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_CAPTURE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
            if (reservation.closedByTransactionId !== winnerTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture`);
            return { transaction: mapped, reservation: this.mapReservation(reservation) };
          }
        }
      }
      throw err;
    }
  }

  async captureReservationWithinTransaction(
    tx: Prisma.TransactionClient,
    params: CaptureReservationParams,
  ): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await tx.walletReservation.findUnique({ where: { id: params.reservationId } });
        if (!reservation || reservation.walletId !== params.walletId) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture`);
        const mapped = this.mapTransaction(existingTx);
        this.assertIdempotentTransaction(mapped, { type: WalletTransactionType.RESERVATION_CAPTURE, amountCents: fromSafeBigIntCents(reservation.amountCents), currency: reservation.currency }, params.transactionKey);
        if (reservation.closedByTransactionId !== existingTx.id) throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested reservation capture`);
        return { transaction: mapped, reservation: this.mapReservation(reservation) };
      }
    }

    const reservation = await this.lockReservation(tx, params.reservationId);

    if (!reservation) {
      throw new WalletNotFoundError(`Reservation not found: ${params.reservationId}`);
    }

    if (reservation.walletId !== params.walletId) {
      throw new ValidationError(`Cross-wallet invariant violation: reservation belongs to ${reservation.walletId}, operation on ${params.walletId}`);
    }

    if (reservation.status !== WalletReservationStatus.ACTIVE) {
      throw new WalletConflictError(`Reservation is not active (current status: ${reservation.status})`);
    }

    await tx.walletBalance.update({
      where: {
        walletId_currency: { walletId: params.walletId, currency: reservation.currency },
      },
      data: {
        reservedCents: { decrement: reservation.amountCents },
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        id: params.transactionId,
        walletId: params.walletId,
        currency: reservation.currency,
        amountCents: fromSafeBigIntCents(reservation.amountCents),
        type: WalletTransactionType.RESERVATION_CAPTURE,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    const updatedReservation = await tx.walletReservation.update({
      where: { id: reservation.id },
      data: {
        status: WalletReservationStatus.CAPTURED,
        closedByTransactionId: transaction.id,
      },
    });

    return {
      transaction: this.mapTransaction(transaction),
      reservation: this.mapReservation(updatedReservation),
    };
  }

  async rollbackTransaction(
    params: RollbackTransactionParams,
    externalTx?: Prisma.TransactionClient
  ): Promise<WalletTransactionDto> {
    if (externalTx) {
      return this.rollbackTransactionWithinTransaction(externalTx, params);
    }

    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        if (
          existingTx.type !== WalletTransactionType.ROLLBACK ||
          existingTx.reversalOfTransactionId !== params.targetTransactionId
        ) {
          throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested rollback target`);
        }
        return this.mapTransaction(existingTx);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => this.rollbackTransactionWithinTransaction(tx, params));
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          if (
            winnerTx.type !== WalletTransactionType.ROLLBACK ||
            winnerTx.reversalOfTransactionId !== params.targetTransactionId
          ) {
            throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested rollback target`);
          }
          return this.mapTransaction(winnerTx);
        }
      }
      throw err;
    }
  }

  async rollbackTransactionWithinTransaction(
    tx: Prisma.TransactionClient,
    params: RollbackTransactionParams,
  ): Promise<WalletTransactionDto> {
    await this.lockActiveWallet(tx, params.walletId);

    if (params.transactionKey) {
      const existingTx = await tx.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        if (
          existingTx.type !== WalletTransactionType.ROLLBACK ||
          existingTx.reversalOfTransactionId !== params.targetTransactionId
        ) {
          throw new WalletConflictError(`Transaction key ${params.transactionKey} does not match the requested rollback target`);
        }
        return this.mapTransaction(existingTx);
      }
    }

    const lockedTarget = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM wallet_transactions
      WHERE id = ${params.targetTransactionId}
      FOR UPDATE
    `;
    if (!lockedTarget[0]) {
      throw new WalletNotFoundError(`Target transaction not found: ${params.targetTransactionId}`);
    }

    const targetTx = await tx.walletTransaction.findUnique({
      where: { id: params.targetTransactionId },
    });
    if (!targetTx) {
      throw new WalletNotFoundError(`Target transaction not found: ${params.targetTransactionId}`);
    }

    if (targetTx.walletId !== params.walletId) {
      throw new ValidationError(`Cross-wallet invariant violation: target transaction belongs to ${targetTx.walletId}, operation on ${params.walletId}`);
    }

    if (targetTx.type === WalletTransactionType.ROLLBACK) {
      throw new WalletConflictError(`Cannot rollback a rollback transaction: ${targetTx.id}`);
    }

    const existingReversal = await tx.walletTransaction.findFirst({
      where: {
        walletId: params.walletId,
        reversalOfTransactionId: targetTx.id,
      },
    });

    if (existingReversal) {
      throw new WalletConflictError(`Transaction ${targetTx.id} has already been reversed by ${existingReversal.id}`);
    }

    if (targetTx.type === WalletTransactionType.RESERVATION_RELEASE) {
      throw new WalletConflictError(`Cannot automatically rollback a reservation release: ${targetTx.id}`);
    }

    if (targetTx.type === WalletTransactionType.RESERVATION_HOLD) {
      const res = await tx.walletReservation.findFirst({
        where: { walletId: params.walletId, createdByTransactionId: targetTx.id },
      });
      if (!res) {
        throw new WalletNotFoundError(`Reservation not found for hold transaction: ${targetTx.id}`);
      }

      const lockedReservation = await this.lockReservation(tx, res.id);
      if (lockedReservation.status !== WalletReservationStatus.ACTIVE) {
        throw new WalletConflictError(`Reservation cannot be rolled back in current status: ${lockedReservation.status}`);
      }

      await tx.walletBalance.update({
        where: {
          walletId_currency: { walletId: params.walletId, currency: lockedReservation.currency },
        },
        data: {
          reservedCents: { decrement: lockedReservation.amountCents },
          availableCents: { increment: lockedReservation.amountCents },
        },
      });

      const rollbackTx = await tx.walletTransaction.create({
        data: {
          id: params.rollbackTransactionId,
          walletId: params.walletId,
          currency: targetTx.currency,
          amountCents: targetTx.amountCents,
          type: WalletTransactionType.ROLLBACK,
          status: WalletTransactionStatus.SETTLED,
          actorId: params.actorId,
          transactionKey: params.transactionKey ?? null,
          reversalOfTransactionId: targetTx.id,
          metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      await tx.walletReservation.update({
        where: { id: lockedReservation.id },
        data: {
          status: WalletReservationStatus.ROLLED_BACK,
          closedByTransactionId: rollbackTx.id,
        },
      });

      return this.mapTransaction(rollbackTx);
    }

    let reservationToUpdate: Awaited<ReturnType<typeof this.lockReservation>> | null = null;

    if (targetTx.type === WalletTransactionType.RESERVATION_CAPTURE) {
      const res = await tx.walletReservation.findFirst({
        where: { walletId: params.walletId, closedByTransactionId: targetTx.id },
      });
      if (!res) {
        throw new WalletNotFoundError(`Reservation not found for capture transaction: ${targetTx.id}`);
      }
      reservationToUpdate = await this.lockReservation(tx, res.id);
      if (reservationToUpdate.status !== WalletReservationStatus.CAPTURED) {
        throw new WalletConflictError(`Captured reservation cannot be rolled back in current status: ${reservationToUpdate.status}`);
      }
    }

    const lockedBalance = await tx.$queryRaw<Array<{
      wallet_id: string;
      currency: string;
      available_cents: bigint;
      reserved_cents: bigint;
    }>>`
      SELECT wallet_id, currency, available_cents, reserved_cents
      FROM wallet_balances
      WHERE wallet_id = ${params.walletId} AND currency = ${targetTx.currency}
      FOR UPDATE
    `;

    const balance = lockedBalance[0];
    if (!balance) {
      throw new WalletNotFoundError(`Wallet balance not found for ${params.walletId} / ${targetTx.currency}`);
    }

    if (targetTx.type === WalletTransactionType.CREDIT && balance.available_cents < targetTx.amountCents) {
      throw new ValidationError(`Insufficient available balance to rollback credit: requires ${fromSafeBigIntCents(targetTx.amountCents)}`);
    }

    if (targetTx.type !== WalletTransactionType.CREDIT && targetTx.type !== WalletTransactionType.DEBIT && targetTx.type !== WalletTransactionType.RESERVATION_CAPTURE) {
      throw new WalletConflictError(`Transaction type cannot be rolled back automatically: ${targetTx.type}`);
    }

    await tx.walletBalance.update({
      where: { walletId_currency: { walletId: params.walletId, currency: targetTx.currency } },
      data: {
        availableCents: targetTx.type === WalletTransactionType.CREDIT
          ? { decrement: targetTx.amountCents }
          : { increment: targetTx.amountCents },
      },
    });

    const rollbackTx = await tx.walletTransaction.create({
      data: {
        id: params.rollbackTransactionId,
        walletId: params.walletId,
        currency: targetTx.currency,
        amountCents: targetTx.amountCents,
        type: WalletTransactionType.ROLLBACK,
        status: WalletTransactionStatus.SETTLED,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        reversalOfTransactionId: targetTx.id,
        metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (reservationToUpdate) {
      await tx.walletReservation.update({
        where: { id: reservationToUpdate.id },
        data: {
          status: WalletReservationStatus.ROLLED_BACK,
          closedByTransactionId: rollbackTx.id,
        },
      });
    }

    return this.mapTransaction(rollbackTx);
  }

  private mapTransaction(tx: {
    id: string;
    walletId: string;
    currency: string;
    amountCents: bigint;
    type: WalletTransactionType;
    status: WalletTransactionStatus;
    actorId: string;
    transactionKey: string | null;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    reversalOfTransactionId: string | null;
    occurredAt: Date;
    metadataJson: Prisma.JsonValue;
  }): WalletTransactionDto {
    return Object.freeze({
      id: tx.id,
      walletId: tx.walletId,
      currency: tx.currency,
      amountCents: fromSafeBigIntCents(tx.amountCents),
      type: tx.type,
      status: tx.status,
      actorId: tx.actorId,
      transactionKey: tx.transactionKey,
      relatedEntityType: tx.relatedEntityType,
      relatedEntityId: tx.relatedEntityId,
      reversalOfTransactionId: tx.reversalOfTransactionId,
      occurredAt: tx.occurredAt.toISOString(),
      metadata: Object.freeze(
        typeof tx.metadataJson === 'object' && tx.metadataJson !== null
          ? (tx.metadataJson as Record<string, unknown>)
          : {}
      ),
    });
  }

  private mapReservation(res: {
    id: string;
    walletId: string;
    currency: string;
    amountCents: bigint;
    status: WalletReservationStatus;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    createdByTransactionId: string;
    closedByTransactionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    metadataJson: Prisma.JsonValue;
  }): WalletReservationDto {
    return Object.freeze({
      id: res.id,
      walletId: res.walletId,
      currency: res.currency,
      amountCents: fromSafeBigIntCents(res.amountCents),
      status: res.status,
      relatedEntityType: res.relatedEntityType,
      relatedEntityId: res.relatedEntityId,
      createdByTransactionId: res.createdByTransactionId,
      closedByTransactionId: res.closedByTransactionId,
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
      metadata: Object.freeze(
        typeof res.metadataJson === 'object' && res.metadataJson !== null
          ? (res.metadataJson as Record<string, unknown>)
          : {}
      ),
    });
  }
}