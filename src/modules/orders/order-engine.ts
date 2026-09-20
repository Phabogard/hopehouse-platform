import { ValidationError } from '../../core/errors.js';
import { advanceOrder, createOrder, isOrderComplete, orderCycle, type CreateOrderInput, type Order, type OrderStep } from './orders.js';
import type { OrderRepository } from './order-repository.js';
import type { IdempotencyStore } from '../../core/idempotency/idempotency.js';

export type OrderStepHandler = (context: {
  readonly order: Order;
  readonly actorId: string;
  readonly fromStep: OrderStep;
  readonly toStep: OrderStep;
  /** Transactional persistence context supplied by the repository during a locked transition. */
  readonly tx?: unknown;
}) => Promise<void> | void;

export type OrderStepHandlers = Partial<Record<OrderStep, OrderStepHandler>>;

export interface RunToAuditParams {
  readonly order: Order;
  readonly actorId: string;
}

export interface OrderCreatePersistenceDependencies {
  readonly prisma: { $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> };
  readonly idempotencyStore: IdempotencyStore;
  readonly createIdempotencyStore: (tx: unknown) => IdempotencyStore;
}

export interface AdvanceParams {
  readonly order: Order;
  readonly actorId: string;
  readonly toStep: OrderStep;
  readonly metadata?: Record<string, unknown>;
}

export class OrderEngine {
  constructor(
    private readonly handlers: OrderStepHandlers = {},
    private readonly repository?: OrderRepository,
    private readonly createPersistence?: OrderCreatePersistenceDependencies,
  ) {}

  create(input: CreateOrderInput): Order {
    return createOrder(input);
  }

  async createPersisted(input: CreateOrderInput, idempotencyKey?: string): Promise<Order> {
    if (this.repository) {
      if (idempotencyKey && this.createPersistence) {
        const operation = 'order.create';
        const existing = await this.createPersistence.idempotencyStore.find(idempotencyKey, operation);
        if (existing?.resultReference) {
          const replay = await this.repository.getById(existing.resultReference);
          if (replay) return replay;
        }
        const orderId = randomUUID();
        return await this.createPersistence.prisma.$transaction(async (tx) => {
          const store = this.createPersistence!.createIdempotencyStore(tx);
          const won = await store.save({ key: idempotencyKey, operation, resultReference: orderId, createdAt: new Date().toISOString() });
          if (!won) {
            const record = await store.find(idempotencyKey, operation);
            if (record?.resultReference) {
              const replay = await this.repository!.getById(record.resultReference);
              if (replay) return replay;
            }
            throw new Error('Idempotency claim won by another request but no order result is available');
          }
          return await this.repository!.create({
            id: orderId,
        serviceDefinitionId: input.serviceDefinitionId,
        catalogItemId: input.catalogItemId,
        mode: input.mode,
        requesterActorId: input.requesterActorId,
        beneficiaryId: input.beneficiaryId,
        channel: input.channel,
        amountCents: input.monetaryIntent?.amountCents,
        currency: input.monetaryIntent?.currency,
        metadata: input.metadata,
          }, tx);
        });
    }
    return createOrder(input);
  }

  async advance(params: AdvanceParams): Promise<Order> {
    const handler = this.handlers[params.toStep];

    if (this.repository) {
      return await this.repository.advanceWithLock({
        orderId: params.order.id,
        expectedFromStep: params.order.currentStep,
        toStep: params.toStep,
        actorId: params.actorId,
        metadata: params.metadata,
        beforeCommit: handler
          ? async (lockedOrder, tx) => {
              await handler({
                order: lockedOrder,
                actorId: params.actorId,
                fromStep: lockedOrder.currentStep,
                toStep: params.toStep,
                tx,
              });
            }
          : undefined,
      });
    }

    if (handler) {
      await handler({
        order: params.order,
        actorId: params.actorId,
        fromStep: params.order.currentStep,
        toStep: params.toStep,
      });
    }

    return advanceOrder({
      order: params.order,
      actorId: params.actorId,
      expectedFromStep: params.order.currentStep,
      toStep: params.toStep,
      metadata: params.metadata,
    });
  }

  async runToAudit(params: RunToAuditParams): Promise<Order> {
    let currentOrder = params.order;
    const currentIndex = orderCycle.indexOf(currentOrder.currentStep);
    if (currentIndex === -1) {
      throw new ValidationError(`Étape courante inconnue : ${currentOrder.currentStep}`);
    }

    const remainingSteps = orderCycle.slice(currentIndex + 1) as OrderStep[];

    for (const step of remainingSteps) {
      if (isOrderComplete(currentOrder)) break;
      currentOrder = await this.advance({
        order: currentOrder,
        actorId: params.actorId,
        toStep: step,
      });
    }

    return currentOrder;
  }
}
