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

  async credit(params: CreditWalletParams): Promise<WalletTransactionDto> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    // Fast-path read check before starting transaction
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        return this.mapTransaction(existingTx);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Idempotence Check inside transaction
        if (params.transactionKey) {
          const existingTx = await tx.walletTransaction.findFirst({
            where: { walletId: params.walletId, transactionKey: params.transactionKey },
          });
          if (existingTx) {
            return this.mapTransaction(existingTx);
          }
        }

        // 2. Lock / Upsert Balance
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

        // 3. Create Transaction
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
      });
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          return this.mapTransaction(winnerTx);
        }
      }
      throw err;
    }
  }

  async debit(params: DebitWalletParams): Promise<WalletTransactionDto> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    // Fast-path read check
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        return this.mapTransaction(existingTx);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Idempotence Check
        if (params.transactionKey) {
          const existingTx = await tx.walletTransaction.findFirst({
            where: { walletId: params.walletId, transactionKey: params.transactionKey },
          });
          if (existingTx) {
            return this.mapTransaction(existingTx);
          }
        }

        // 2. Lock and Check Balance
        const balance = await tx.walletBalance.findUnique({
          where: { walletId_currency: { walletId: params.walletId, currency } },
        });

        if (!balance || balance.availableCents < amountBigInt) {
          throw new ValidationError(
            `Insufficient available balance in ${currency}: requested ${params.amountCents}, available ${balance ? fromSafeBigIntCents(balance.availableCents) : 0}`
          );
        }

        // 3. Decrement Balance
        await tx.walletBalance.update({
          where: { walletId_currency: { walletId: params.walletId, currency } },
          data: {
            availableCents: { decrement: amountBigInt },
          },
        });

        // 4. Create Transaction
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
      });
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          return this.mapTransaction(winnerTx);
        }
      }
      throw err;
    }
  }

  async reserve(params: ReserveWalletParams): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = validateCurrency(params.currency);

    // Fast-path read check
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findFirst({
          where: { walletId: params.walletId, createdByTransactionId: existingTx.id },
        });
        if (reservation) {
          return {
            transaction: this.mapTransaction(existingTx),
            reservation: this.mapReservation(reservation),
          };
        }
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Idempotence Check
        if (params.transactionKey) {
          const existingTx = await tx.walletTransaction.findFirst({
            where: { walletId: params.walletId, transactionKey: params.transactionKey },
          });
          if (existingTx) {
            const reservation = await tx.walletReservation.findFirst({
              where: { walletId: params.walletId, createdByTransactionId: existingTx.id },
            });
            if (reservation) {
              return {
                transaction: this.mapTransaction(existingTx),
                reservation: this.mapReservation(reservation),
              };
            }
          }
        }

        // 2. Lock & Check Balance
        const balance = await tx.walletBalance.findUnique({
          where: { walletId_currency: { walletId: params.walletId, currency } },
        });

        if (!balance || balance.availableCents < amountBigInt) {
          throw new ValidationError(
            `Insufficient available balance in ${currency} for reservation: requested ${params.amountCents}, available ${balance ? fromSafeBigIntCents(balance.availableCents) : 0}`
          );
        }

        // 3. Move from Available to Reserved
        await tx.walletBalance.update({
          where: { walletId_currency: { walletId: params.walletId, currency } },
          data: {
            availableCents: { decrement: amountBigInt },
            reservedCents: { increment: amountBigInt },
          },
        });

        // 4. Create Hold Transaction
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

        // 5. Create Reservation (Option B enforce wallet_id = transaction.wallet_id)
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
      });
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          const winnerRes = await this.prisma.walletReservation.findFirst({
            where: { walletId: params.walletId, createdByTransactionId: winnerTx.id },
          });
          if (winnerRes) {
            return {
              transaction: this.mapTransaction(winnerTx),
              reservation: this.mapReservation(winnerRes),
            };
          }
        }
      }
      throw err;
    }
  }

  async releaseReservation(params: ReleaseReservationParams): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findUnique({
          where: { id: params.reservationId },
        });
        if (reservation) {
          return {
            transaction: this.mapTransaction(existingTx),
            reservation: this.mapReservation(reservation),
          };
        }
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Fetch Reservation
        const reservation = await tx.walletReservation.findUnique({
          where: { id: params.reservationId },
        });

        if (!reservation) {
          throw new WalletNotFoundError(`Reservation not found: ${params.reservationId}`);
        }

        // Invariant Check (Défense en profondeur)
        if (reservation.walletId !== params.walletId) {
          throw new ValidationError(`Cross-wallet invariant violation: reservation belongs to ${reservation.walletId}, operation on ${params.walletId}`);
        }

        if (reservation.status !== WalletReservationStatus.ACTIVE) {
          throw new WalletConflictError(`Reservation is not active (current status: ${reservation.status})`);
        }

        // 2. Return Reserved to Available
        await tx.walletBalance.update({
          where: {
            walletId_currency: { walletId: params.walletId, currency: reservation.currency },
          },
          data: {
            reservedCents: { decrement: reservation.amountCents },
            availableCents: { increment: reservation.amountCents },
          },
        });

        // 3. Create Release Transaction
        const transaction = await tx.walletTransaction.create({
          data: {
            id: params.transactionId,
            walletId: params.walletId,
            currency: reservation.currency,
            amountCents: reservation.amountCents,
            type: WalletTransactionType.RESERVATION_RELEASE,
            status: WalletTransactionStatus.SETTLED,
            actorId: params.actorId,
            transactionKey: params.transactionKey ?? null,
            metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });

        // 4. Close Reservation (Option B verifies same wallet_id)
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
      });
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

  async captureReservation(params: CaptureReservationParams): Promise<{ transaction: WalletTransactionDto; reservation: WalletReservationDto }> {
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        const reservation = await this.prisma.walletReservation.findUnique({
          where: { id: params.reservationId },
        });
        if (reservation) {
          return {
            transaction: this.mapTransaction(existingTx),
            reservation: this.mapReservation(reservation),
          };
        }
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Fetch Reservation
        const reservation = await tx.walletReservation.findUnique({
          where: { id: params.reservationId },
        });

        if (!reservation) {
          throw new WalletNotFoundError(`Reservation not found: ${params.reservationId}`);
        }

        // Invariant Check
        if (reservation.walletId !== params.walletId) {
          throw new ValidationError(`Cross-wallet invariant violation: reservation belongs to ${reservation.walletId}, operation on ${params.walletId}`);
        }

        if (reservation.status !== WalletReservationStatus.ACTIVE) {
          throw new WalletConflictError(`Reservation is not active (current status: ${reservation.status})`);
        }

        // 2. Consume Reserved Balance (without returning to available)
        await tx.walletBalance.update({
          where: {
            walletId_currency: { walletId: params.walletId, currency: reservation.currency },
          },
          data: {
            reservedCents: { decrement: reservation.amountCents },
          },
        });

        // 3. Create Capture Transaction
        const transaction = await tx.walletTransaction.create({
          data: {
            id: params.transactionId,
            walletId: params.walletId,
            currency: reservation.currency,
            amountCents: reservation.amountCents,
            type: WalletTransactionType.RESERVATION_CAPTURE,
            status: WalletTransactionStatus.SETTLED,
            actorId: params.actorId,
            transactionKey: params.transactionKey ?? null,
            metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
          },
        });

        // 4. Close Reservation (Option B)
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
      });
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

  async rollbackTransaction(params: RollbackTransactionParams): Promise<WalletTransactionDto> {
    if (params.transactionKey) {
      const existingTx = await this.prisma.walletTransaction.findFirst({
        where: { walletId: params.walletId, transactionKey: params.transactionKey },
      });
      if (existingTx) {
        return this.mapTransaction(existingTx);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 1. Fetch Target Transaction
        const targetTx = await tx.walletTransaction.findUnique({
          where: { id: params.targetTransactionId },
        });

        if (!targetTx) {
          throw new WalletNotFoundError(`Target transaction not found: ${params.targetTransactionId}`);
        }

        // Invariant Check (Défense en profondeur)
        if (targetTx.walletId !== params.walletId) {
          throw new ValidationError(`Cross-wallet invariant violation: target transaction belongs to ${targetTx.walletId}, operation on ${params.walletId}`);
        }

        if (targetTx.type === WalletTransactionType.ROLLBACK) {
          throw new WalletConflictError(`Cannot rollback a rollback transaction: ${targetTx.id}`);
        }

        // Check if already rolled back
        const existingReversal = await tx.walletTransaction.findFirst({
          where: {
            walletId: params.walletId,
            reversalOfTransactionId: targetTx.id,
          },
        });

        if (existingReversal) {
          throw new WalletConflictError(`Transaction ${targetTx.id} has already been reversed by ${existingReversal.id}`);
        }

        // 2. Reverse Balances based on Transaction Type
        if (targetTx.type === WalletTransactionType.CREDIT) {
          // Rollback Credit -> Deduct from available
          const balance = await tx.walletBalance.findUnique({
            where: { walletId_currency: { walletId: params.walletId, currency: targetTx.currency } },
          });
          if (!balance || balance.availableCents < targetTx.amountCents) {
            throw new ValidationError(`Insufficient available balance to rollback credit: requires ${fromSafeBigIntCents(targetTx.amountCents)}`);
          }
          await tx.walletBalance.update({
            where: { walletId_currency: { walletId: params.walletId, currency: targetTx.currency } },
            data: { availableCents: { decrement: targetTx.amountCents } },
          });
        } else if (targetTx.type === WalletTransactionType.DEBIT) {
          // Rollback Debit -> Restore to available
          await tx.walletBalance.update({
            where: { walletId_currency: { walletId: params.walletId, currency: targetTx.currency } },
            data: { availableCents: { increment: targetTx.amountCents } },
          });
        } else if (targetTx.type === WalletTransactionType.RESERVATION_HOLD) {
          // Rollback active reservation
          const res = await tx.walletReservation.findFirst({
            where: { walletId: params.walletId, createdByTransactionId: targetTx.id },
          });
          if (res && res.status === WalletReservationStatus.ACTIVE) {
            await tx.walletBalance.update({
              where: { walletId_currency: { walletId: params.walletId, currency: res.currency } },
              data: {
                reservedCents: { decrement: res.amountCents },
                availableCents: { increment: res.amountCents },
              },
            });
            await tx.walletReservation.update({
              where: { id: res.id },
              data: { status: WalletReservationStatus.ROLLED_BACK },
            });
          }
        }

        // 3. Create Rollback Transaction (Option B composite foreign key ensures same wallet_id)
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

        return this.mapTransaction(rollbackTx);
      });
    } catch (err: any) {
      if (params.transactionKey && isTransactionKeyUniqueViolation(err)) {
        const winnerTx = await this.prisma.walletTransaction.findFirst({
          where: { walletId: params.walletId, transactionKey: params.transactionKey },
        });
        if (winnerTx) {
          return this.mapTransaction(winnerTx);
        }
      }
      throw err;
    }
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
