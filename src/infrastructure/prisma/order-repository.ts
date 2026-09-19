import type { Prisma, PrismaClient, OrderStep as PrismaOrderStep, OrderMode as PrismaOrderMode, OrderTransitionOutcome as PrismaOrderTransitionOutcome } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';
import type { Order, OrderTransition, OrderStep, OrderMode, OrderTransitionOutcome } from '../../modules/orders/orders.js';
import type { OrderRepository, CreateOrderParams, AdvanceOrderTransactionalParams } from '../../modules/orders/order-repository.js';
import type { AuditLogRepository } from '../../modules/audit/audit-log.js';
import { assertOrderTransition } from '../../modules/orders/orders.js';

export function toSafeBigIntCents(amount: number | bigint | null | undefined): bigint | null {
  if (amount === null || amount === undefined) return null;
  if (typeof amount === 'bigint') {
    if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ValidationError(`Le montant bigint est hors de la plage sûre [0, ${Number.MAX_SAFE_INTEGER}] : reçu ${amount}`);
    }
    return amount;
  }
  if (typeof amount === 'number') {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new ValidationError(`Le montant doit être un entier positif ou nul : reçu ${amount}`);
    }
    return BigInt(amount);
  }
  throw new ValidationError(`Type de montant invalide : ${typeof amount}`);
}

export function fromSafeBigIntCents(amount: bigint | null): number | null {
  if (amount === null) return null;
  if (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ValidationError(`Le montant bigint stocké en base est hors de la plage sûre [0, ${Number.MAX_SAFE_INTEGER}] : reçu ${amount}`);
  }
  return Number(amount);
}

export class PrismaOrderRepository implements OrderRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepository?: AuditLogRepository,
  ) {}

  async create(params: CreateOrderParams, externalTx?: Prisma.TransactionClient): Promise<Order> {
    const orderId = params.id ?? randomUUID();
    const orderNumber = params.orderNumber ?? orderId;
    const now = new Date();

    const hasAmount = params.amountCents !== null && params.amountCents !== undefined;
    const rawCurrency = params.currency ? params.currency.trim() : null;
    const hasCurrency = rawCurrency !== null && rawCurrency.length > 0;

    if (hasAmount !== hasCurrency) {
      throw new ValidationError('Le montant et la devise doivent être fournis ensemble ou tous les deux absents');
    }

    const amountBigInt = toSafeBigIntCents(params.amountCents);
    const currency = hasCurrency ? rawCurrency!.toUpperCase() : null;
    if (currency && currency.length !== 3) {
      throw new ValidationError('La devise de commande doit utiliser un code à trois caractères');
    }

    const execute = async (tx: Prisma.TransactionClient): Promise<Order> => {
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
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          },
        },
      });

      if (this.auditRepository) {
        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            actorUserId: params.requesterActorId,
            action: 'order.create',
            entityType: 'order',
            entityId: orderId,
            outcome: 'success',
            occurredAt: now,
            metadata: {
              serviceDefinitionId: params.serviceDefinitionId,
              mode: params.mode,
            } as Prisma.InputJsonValue,
          },
        });
      }

      return this.mapOrder(orderRow);
    };

    if (externalTx) {
      return await execute(externalTx);
    }

    return await this.prisma.$transaction(async (tx) => execute(tx));
  }

  async getById(orderId: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transitions: {
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
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
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return row ? this.mapOrder(row) : null;
  }

  /**
   * Concurrency protection via SELECT ... FOR UPDATE within a transaction.
   * Locks the order row, executes side-effect handlers (beforeCommit) under lock,
   * verifies state machine transition, appends transition,
   * writes audit log, and updates currentStep and updatedAt atomically.
   */
  async advanceWithLock(params: AdvanceOrderTransactionalParams, externalTx?: Prisma.TransactionClient): Promise<Order> {
    const execute = async (tx: Prisma.TransactionClient): Promise<Order> => {
      // 1. Row Lock (SELECT ... FOR UPDATE)
      const lockedRows = await tx.$queryRaw<Array<{
        id: string;
        order_number: string;
        current_step: string;
        service_definition_id: string;
        catalog_item_id: string | null;
        mode: string;
        requester_actor_id: string;
        beneficiary_id: string | null;
        channel: string | null;
        amount_cents: bigint | null;
        currency: string | null;
        metadata_json: Prisma.InputJsonValue;
        created_at: Date;
        updated_at: Date;
      }>>`
        SELECT
          id,
          order_number,
          current_step,
          service_definition_id,
          catalog_item_id,
          mode,
          requester_actor_id,
          beneficiary_id,
          channel,
          amount_cents,
          currency,
          metadata_json,
          created_at,
          updated_at
        FROM "orders"
        WHERE id = ${params.orderId}
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        throw new ValidationError(`Commande introuvable : ${params.orderId}`);
      }

      const lockedRow = lockedRows[0]!;
      const currentStep = lockedRow.current_step as OrderStep;

      if (currentStep !== params.expectedFromStep) {
        throw new ValidationError(`L'état courant de la commande est ${currentStep}`);
      }

      assertOrderTransition(currentStep, params.toStep);

      const existingTransitions = await tx.orderTransition.findMany({
        where: { orderId: params.orderId },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });

      const currentOrder = this.mapOrder({
        id: lockedRow.id,
        orderNumber: lockedRow.order_number,
        currentStep: lockedRow.current_step as PrismaOrderStep,
        serviceDefinitionId: lockedRow.service_definition_id,
        catalogItemId: lockedRow.catalog_item_id,
        mode: lockedRow.mode as PrismaOrderMode,
        requesterActorId: lockedRow.requester_actor_id,
        beneficiaryId: lockedRow.beneficiary_id,
        channel: lockedRow.channel,
        amountCents: lockedRow.amount_cents,
        currency: lockedRow.currency,
        metadataJson: lockedRow.metadata_json as Prisma.JsonValue,
        createdAt: lockedRow.created_at,
        updatedAt: lockedRow.updated_at,
        transitions: existingTransitions,
      });

      // 2. Execute beforeCommit handler under SELECT FOR UPDATE lock
      if (params.beforeCommit) {
        await params.beforeCommit(currentOrder, tx);
      }

      const now = new Date();
      const transitionId = randomUUID();

      // 3. Insert transition
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

      // 4. Update Order current_step
      const updatedOrderRow = await tx.order.update({
        where: { id: params.orderId },
        data: {
          currentStep: params.toStep as PrismaOrderStep,
          updatedAt: now,
        },
        include: {
          transitions: {
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
          },
        },
      });

      // 5. Atomic AuditLog insertion
      if (this.auditRepository) {
        await tx.auditLog.create({
          data: {
            id: randomUUID(),
            actorUserId: params.actorId,
            action: 'order.transition',
            entityType: 'order',
            entityId: params.orderId,
            outcome: 'success',
            occurredAt: now,
            metadata: {
              fromStep: currentStep,
              toStep: params.toStep,
              ...(params.metadata ?? {}),
            } as Prisma.InputJsonValue,
          },
        });
      }

      return this.mapOrder(updatedOrderRow);
    };

    if (externalTx) {
      return await execute(externalTx);
    }

    return await this.prisma.$transaction(async (tx) => execute(tx));
  }

  async getTransitionHistory(orderId: string): Promise<readonly OrderTransition[]> {
    const rows = await this.prisma.orderTransition.findMany({
      where: { orderId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
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
    const hasAmount = row.amountCents !== null;
    const hasCurrency = row.currency !== null;
    if (hasAmount !== hasCurrency) {
      throw new ValidationError('Incohérence en base de données : montant et devise doivent être présents ou absents tous les deux');
    }

    const monetaryIntent = hasAmount && hasCurrency
      ? Object.freeze({ amountCents: fromSafeBigIntCents(row.amountCents)!, currency: row.currency! })
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
