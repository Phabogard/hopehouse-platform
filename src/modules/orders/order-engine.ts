import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';
import { resolveOrderPrice, type CatalogueOrderPricingRepository } from '../catalogue/catalogue-pricing.js';
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
  readonly createPricingRepository?: (tx: unknown) => CatalogueOrderPricingRepository;
}

export interface AdvanceParams {
  readonly order: Order;
  readonly actorId: string;
  readonly toStep: OrderStep;
  readonly metadata?: Record<string, unknown>;
  readonly idempotencyKey?: string;
}

function assertNoUnresolvedClientPrice(input: CreateOrderInput): void {
  if (input.monetaryIntent !== undefined && input.monetaryIntent !== null) {
    throw new ValidationError('Un prix de commande ne peut pas être fourni sans item catalogue résolvable');
  }
}

async function resolvePersistedInput(
  input: CreateOrderInput,
  pricingRepository: CatalogueOrderPricingRepository | undefined,
): Promise<CreateOrderInput> {
  if (pricingRepository === undefined) {
    if (input.catalogItemId !== undefined && input.catalogItemId !== null) {
      throw new ValidationError('La résolution du prix catalogue est obligatoire pour les commandes persistées');
    }
    return input;
  }

  if (input.catalogItemId === undefined || input.catalogItemId === null) {
    assertNoUnresolvedClientPrice(input);
    return input;
  }

  const resolved = await resolveOrderPrice(pricingRepository, {
    serviceDefinitionId: input.serviceDefinitionId,
    catalogItemId: input.catalogItemId,
    requestedAmountCents: input.monetaryIntent?.amountCents,
    requestedCurrency: input.monetaryIntent?.currency,
  });

  return {
    ...input,
    monetaryIntent: {
      amountCents: resolved.amountCents,
      currency: resolved.currency,
    },
    metadata: {
      ...(input.metadata ?? {}),
      pricing: {
        ruleId: resolved.ruleId,
        amountCents: resolved.amountCents,
        currency: resolved.currency,
        resolvedAt: resolved.resolvedAt,
        source: 'catalogue',
      },
    },
  };
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
    if (!this.repository) return createOrder(input);

    if (!this.createPersistence) {
      if (input.catalogItemId !== undefined && input.catalogItemId !== null) {
        throw new ValidationError('La résolution du prix catalogue est obligatoire pour les commandes persistées');
      }
      if (input.monetaryIntent !== undefined && input.monetaryIntent !== null) {
        throw new ValidationError('Un prix de commande ne peut pas être fourni sans persistance transactionnelle');
      }
      return await this.repository.create({
        serviceDefinitionId: input.serviceDefinitionId,
        catalogItemId: input.catalogItemId,
        mode: input.mode,
        requesterActorId: input.requesterActorId,
        beneficiaryId: input.beneficiaryId,
        channel: input.channel,
        amountCents: undefined,
        currency: undefined,
        metadata: input.metadata,
      });
    }

    const operation = 'order.create';
    if (idempotencyKey) {
      const existing = await this.createPersistence.idempotencyStore.find(idempotencyKey, operation);
      if (existing?.resultReference) {
        const replay = await this.repository.getById(existing.resultReference);
        if (replay) return replay;
      }
    }

    return await this.createPersistence.prisma.$transaction(async (tx) => {
      const store = this.createPersistence!.createIdempotencyStore(tx);
      const orderId = randomUUID();

      if (idempotencyKey) {
        const won = await store.save({
          key: idempotencyKey,
          operation,
          resultReference: orderId,
          createdAt: new Date().toISOString(),
        });

        if (!won) {
          const record = await store.find(idempotencyKey, operation);
          if (record?.resultReference) {
            const replay = await this.repository!.getById(record.resultReference);
            if (replay) return replay;
          }
          throw new Error('Idempotency claim won by another request but no order result is available');
        }
      }

      const pricingRepository = this.createPersistence!.createPricingRepository?.(tx);
      const resolvedInput = await resolvePersistedInput(input, pricingRepository);

      return await this.repository!.create({
        id: orderId,
        serviceDefinitionId: resolvedInput.serviceDefinitionId,
        catalogItemId: resolvedInput.catalogItemId,
        mode: resolvedInput.mode,
        requesterActorId: resolvedInput.requesterActorId,
        beneficiaryId: resolvedInput.beneficiaryId,
        channel: resolvedInput.channel,
        amountCents: resolvedInput.monetaryIntent?.amountCents,
        currency: resolvedInput.monetaryIntent?.currency,
        metadata: resolvedInput.metadata,
      }, tx);
    });
  }

  async advance(params: AdvanceParams): Promise<Order> {
    const handler = this.handlers[params.toStep];

    if (this.repository) {
      const advance = async (tx?: unknown): Promise<Order> => {
        return await this.repository!.advanceWithLock({
          orderId: params.order.id,
          expectedFromStep: params.order.currentStep,
          toStep: params.toStep,
          actorId: params.actorId,
          metadata: params.metadata,
          beforeCommit: handler
            ? async (lockedOrder, transaction) => {
                await handler({
                  order: lockedOrder,
                  actorId: params.actorId,
                  fromStep: lockedOrder.currentStep,
                  toStep: params.toStep,
                  tx: transaction,
                });
              }
            : undefined,
        }, tx);
      };

      if (params.idempotencyKey && this.createPersistence) {
        const operation = `order.advance:${params.order.id}:${params.toStep}`;
        const existing = await this.createPersistence.idempotencyStore.find(params.idempotencyKey, operation);
        if (existing?.resultReference) {
          const replay = await this.repository.getById(existing.resultReference);
          if (replay) return replay;
        }

        return await this.createPersistence.prisma.$transaction(async (tx) => {
          const store = this.createPersistence!.createIdempotencyStore(tx);
          const won = await store.save({
            key: params.idempotencyKey!,
            operation,
            resultReference: params.order.id,
            createdAt: new Date().toISOString(),
          });

          if (!won) {
            const record = await store.find(params.idempotencyKey!, operation);
            if (record?.resultReference) {
              const replay = await this.repository!.getById(record.resultReference);
              if (replay) return replay;
            }
            throw new Error('Idempotency claim won by another request but no order result is available');
          }

          return await advance(tx);
        });
      }

      return await advance();
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
