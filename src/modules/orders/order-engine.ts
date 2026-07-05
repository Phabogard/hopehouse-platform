import { ValidationError } from '../../core/errors.js';
import { advanceOrder, createOrder, isOrderComplete, orderCycle, type CreateOrderInput, type Order, type OrderStep } from './orders.js';

export interface OrderStepHandlerContext {
  order: Order;
  fromStep: OrderStep;
  toStep: OrderStep;
  actorId: string;
  metadata: Readonly<Record<string, unknown>>;
}

export type OrderStepHandler = (context: OrderStepHandlerContext) => void | Promise<void>;

export interface OrderEngineHandlers {
  readonly validation?: OrderStepHandler;
  readonly payment?: OrderStepHandler;
  readonly execution?: OrderStepHandler;
  readonly notification?: OrderStepHandler;
  readonly receipt?: OrderStepHandler;
  readonly history?: OrderStepHandler;
  readonly audit?: OrderStepHandler;
}

export class OrderEngine {
  constructor(private readonly handlers: OrderEngineHandlers = {}) {}

  create(input: CreateOrderInput): Order {
    return createOrder(input);
  }

  async advance(input: { order: Order; actorId: string; toStep: OrderStep; metadata?: Record<string, unknown> }): Promise<Order> {
    if (input.order.currentStep === 'audit') {
      throw new ValidationError('La commande a déjà terminé le cycle officiel');
    }

    const handler = this.handlers[input.toStep as keyof OrderEngineHandlers];
    if (handler !== undefined) {
      await handler({
        order: input.order,
        fromStep: input.order.currentStep,
        toStep: input.toStep,
        actorId: input.actorId,
        metadata: Object.freeze({ ...(input.metadata ?? {}) }),
      });
    }

    return advanceOrder({
      order: input.order,
      actorId: input.actorId,
      expectedFromStep: input.order.currentStep,
      toStep: input.toStep,
      metadata: input.metadata,
    });
  }

  async runToAudit(input: { order: Order; actorId: string; metadataByStep?: Partial<Record<OrderStep, Record<string, unknown>>> }): Promise<Order> {
    let order = input.order;
    while (!isOrderComplete(order)) {
      const currentIndex = orderCycle.indexOf(order.currentStep);
      const nextStep = orderCycle[currentIndex + 1];
      if (nextStep === undefined) throw new ValidationError('Cycle de commande incomplet');
      order = await this.advance({ order, actorId: input.actorId, toStep: nextStep, metadata: input.metadataByStep?.[nextStep] });
    }
    return order;
  }
}
