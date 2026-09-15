import type { Prisma, PrismaClient, OrderStep as PrismaOrderStep, OrderMode as PrismaOrderMode, OrderTransitionOutcome as PrismaOrderTransitionOutcome } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';
import type { Order, OrderTransition, OrderStep, OrderMode, OrderTransitionOutcome } from '../../modules/orders/orders.js';
import type { OrderRepository, CreateOrderParams, AdvanceOrderTransactionalParams } from '../../modules/orders/order-repository.js';
import { assertOrderTransition } from '../../modules/orders/orders.js';

type TransactionClient = Prisma.TransactionClient;

function toSafeBigIntCents(amount: number | bigint | null | undefined): bigint | null {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === 'bigint') return amount;
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ValidationError(`Le montant doit être un entier positif ou nul : reçu ${amount}`);
  }
  return BigInt(amount);
}

function fromSafeBigIntCents(amount: bigint | null): number | null {
  if (amount === null) return null;
  return Number(amount);
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(params: CreateOrderParams): Promise<Order> {
    const orderId = params.id ?? randomUUID();
    const orderNumber = params.orderNumber ?? orderId;
    const now = new Date();
    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = params.currency ? params.currency.toUpperCase().trim() : null;

    return await this.prisma.$transaction(async (tx) => {
      const initialTransitionId = randomUUID();

      const orderRow = await tx.order.create({
        data: {
          id: orderId,
          orderNumber,
          currentStep: 'creation',
          serviceDefinitionId: params.serviceDefinitionId,
          catalogItemId: params.catalogItemId ?? null,
          mode: params.mode as PrismaOrderMode,
          requesterActorId: params.requesterActorId,
          beneficiaryId: params.beneficiaryId ?? null,
          channel: params.channel ?? null,
          amountCents: amountBigInt,
          currency,
          metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
          createdAt: now,
          updatedAt: now,
          transitions: {
            create: {
              id: initialTransitionId,
              fromStep: null,
              toStep: 'creation',
              outcome: 'succeeded',
              actorId: params.requesterActorId,
              occurredAt: now,
              metadataJson: { reason: 'order.created' },
            },
          },
        },
        include: {
          transitions: {
            orderBy: { occurredAt: 'asc' },
          },
        },
      });

      return this.mapOrder(orderRow);
    });
  }

  async getById(orderId: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transitions: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    return row ? this.mapOrder(row) : null;
  }

  async getByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        transitions: {
          orderBy: { occurredAt: 'asc' },
        },
      },
    });

    return row ? this.mapOrder(row) : null;
  }

  /**
   * Concurrency protection via SELECT ... FOR UPDATE within a transaction.
   * Locks the order row, verifies state machine transition, appends transition,
   * updates currentStep and updatedAt atomically.
   */
  async advanceWithLock(params: AdvanceOrderTransactionalParams): Promise<Order> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Row Lock (SELECT ... FOR UPDATE)
      const lockedRows = await tx.$queryRaw<Array<{ id: string; current_step: string }>>`
        SELECT id, current_step FROM "orders" WHERE id = ${params.orderId} FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        throw new ValidationError(`Commande introuvable : ${params.orderId}`);
      }

      const currentStep = lockedRows[0]!.current_step as OrderStep;

      if (currentStep !== params.expectedFromStep) {
        throw new ValidationError(`L'état courant de la commande est ${currentStep}`);
      }

      assertOrderTransition(currentStep, params.toStep);

      const now = new Date();
      const transitionId = randomUUID();

      // 2. Insert transition
      await tx.orderTransition.create({
        data: {
          id: transitionId,
          orderId: params.orderId,
          fromStep: currentStep as PrismaOrderStep,
          toStep: params.toStep as PrismaOrderStep,
          outcome: 'succeeded' as PrismaOrderTransitionOutcome,
          actorId: params.actorId,
          occurredAt: now,
          metadataJson: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      // 3. Update Order current_step
      const updatedOrderRow = await tx.order.update({
        where: { id: params.orderId },
        data: {
          currentStep: params.toStep as PrismaOrderStep,
          updatedAt: now,
        },
        include: {
          transitions: {
            orderBy: { occurredAt: 'asc' },
          },
        },
      });

      return this.mapOrder(updatedOrderRow);
    });
  }

  async getTransitionHistory(orderId: string): Promise<readonly OrderTransition[]> {
    const rows = await this.prisma.orderTransition.findMany({
      where: { orderId },
      orderBy: { occurredAt: 'asc' },
    });

    return Object.freeze(rows.map((r) => this.mapTransition(r)));
  }

  private mapOrder(row: {
    id: string;
    orderNumber: string;
    currentStep: PrismaOrderStep;
    serviceDefinitionId: string;
    catalogItemId: string | null;
    mode: PrismaOrderMode;
    requesterActorId: string;
    beneficiaryId: string | null;
    channel: string | null;
    amountCents: bigint | null;
    currency: string | null;
    metadataJson: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
    transitions: Array<{
      id: string;
      orderId: string;
      fromStep: PrismaOrderStep | null;
      toStep: PrismaOrderStep;
      outcome: PrismaOrderTransitionOutcome;
      actorId: string;
      occurredAt: Date;
      metadataJson: Prisma.JsonValue;
    }>;
  }): Order {
    const monetaryIntent = row.amountCents !== null && row.currency !== null
      ? Object.freeze({ amountCents: fromSafeBigIntCents(row.amountCents)!, currency: row.currency })
      : null;

    const metadata = typeof row.metadataJson === 'object' && row.metadataJson !== null
      ? (row.metadataJson as Record<string, unknown>)
      : {};

    return Object.freeze({
      id: row.id,
      orderNumber: row.orderNumber,
      currentStep: row.currentStep as OrderStep,
      configuration: Object.freeze({
        serviceDefinitionId: row.serviceDefinitionId,
        catalogItemId: row.catalogItemId,
        mode: row.mode as OrderMode,
      }),
      requester: Object.freeze({ id: row.requesterActorId }),
      beneficiaryId: row.beneficiaryId,
      channel: row.channel,
      monetaryIntent,
      metadata: Object.freeze(metadata),
      transitions: Object.freeze(row.transitions.map((t) => this.mapTransition(t))),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }

  private mapTransition(t: {
    id: string;
    orderId: string;
    fromStep: PrismaOrderStep | null;
    toStep: PrismaOrderStep;
    outcome: PrismaOrderTransitionOutcome;
    actorId: string;
    occurredAt: Date;
    metadataJson: Prisma.JsonValue;
  }): OrderTransition {
    const metadata = typeof t.metadataJson === 'object' && t.metadataJson !== null
      ? (t.metadataJson as Record<string, unknown>)
      : {};

    return Object.freeze({
      id: t.id,
      orderId: t.orderId,
      fromStep: t.fromStep as OrderStep | null,
      toStep: t.toStep as OrderStep,
      outcome: t.outcome as OrderTransitionOutcome,
      actorId: t.actorId,
      occurredAt: t.occurredAt.toISOString(),
      metadata: Object.freeze(metadata),
    });
  }
}
