import { advanceOrder, createOrder, isOrderComplete, type CreateOrderInput, type Order, type OrderStep } from './orders.js';
import type { OrderRepository } from './order-repository.js';

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
    return createOrder(input);
  }

  async advance(params: AdvanceParams): Promise<Order> {
    if (this.repository) {
      const handler = this.handlers[params.toStep];
      if (handler) {
        await handler({
          order: params.order,
          actorId: params.actorId,
          fromStep: params.order.currentStep,
          toStep: params.toStep,
        });
      }
      return await this.repository.advanceWithLock({
        orderId: params.order.id,
        expectedFromStep: params.order.currentStep,
        toStep: params.toStep,
        actorId: params.actorId,
        metadata: params.metadata,
      });
    }

    const handler = this.handlers[params.toStep];
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
    const stepsToRun: OrderStep[] = ['validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit'];

    for (const step of stepsToRun) {
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
