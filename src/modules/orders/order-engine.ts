import { ValidationError } from '../../core/errors.js';
import { advanceOrder, createOrder, isOrderComplete, orderCycle, type CreateOrderInput, type Order, type OrderStep } from './orders.js';
import type { OrderRepository } from './order-repository.js';
import type { AuditLogService } from '../audit/audit-log.js';

export type OrderStepHandler = (context: {
  readonly order: Order;
  readonly actorId: string;
  readonly fromStep: OrderStep;
  readonly toStep: OrderStep;
}) => Promise<void> | void;

export type OrderStepHandlers = Partial<Record<OrderStep, OrderStepHandler>>;

export interface RunToAuditParams {
  readonly order: Order;
  readonly actorId: string;
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
    private readonly audit?: AuditLogService,
  ) {}

  create(input: CreateOrderInput): Order {
    return createOrder(input);
  }

  async createPersisted(input: CreateOrderInput): Promise<Order> {
    if (this.repository) {
      return await this.repository.create({
        serviceDefinitionId: input.serviceDefinitionId,
        catalogItemId: input.catalogItemId,
        mode: input.mode,
        requesterActorId: input.requesterActorId,
        beneficiaryId: input.beneficiaryId,
        channel: input.channel,
        amountCents: input.monetaryIntent?.amountCents,
        currency: input.monetaryIntent?.currency,
        metadata: input.metadata,
      });
    }
    const order = createOrder(input);
    if (this.audit) {
      await this.audit.record({
        actorUserId: input.requesterActorId,
        action: 'order.create',
        entityType: 'order',
        entityId: order.id,
        outcome: 'success',
        metadata: { serviceDefinitionId: input.serviceDefinitionId, mode: input.mode },
      });
    }
    return order;
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
          ? async (lockedOrder) => {
              await handler({
                order: lockedOrder,
                actorId: params.actorId,
                fromStep: lockedOrder.currentStep,
                toStep: params.toStep,
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

    const advanced = advanceOrder({
      order: params.order,
      actorId: params.actorId,
      expectedFromStep: params.order.currentStep,
      toStep: params.toStep,
      metadata: params.metadata,
    });

    if (this.audit) {
      await this.audit.record({
        actorUserId: params.actorId,
        action: 'order.transition',
        entityType: 'order',
        entityId: advanced.id,
        outcome: 'success',
        metadata: { fromStep: params.order.currentStep, toStep: params.toStep, ...(params.metadata ?? {}) },
      });
    }

    return advanced;
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
