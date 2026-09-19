import type { Order, OrderTransition, OrderStep } from './orders.js';

export interface CreateOrderParams {
  readonly id?: string;
  readonly orderNumber?: string;
  readonly serviceDefinitionId: string;
  readonly catalogItemId?: string | null;
  readonly mode: 'manual' | 'semi_automatic' | 'automatic';
  readonly requesterActorId: string;
  readonly beneficiaryId?: string | null;
  readonly channel?: string | null;
  readonly amountCents?: number | bigint | null;
  readonly currency?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface AppendTransitionParams {
  readonly id?: string;
  readonly orderId: string;
  readonly fromStep: OrderStep | null;
  readonly toStep: OrderStep;
  readonly outcome?: 'succeeded' | 'failed';
  readonly actorId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AdvanceOrderTransactionalParams {
  readonly orderId: string;
  readonly expectedFromStep: OrderStep;
  readonly toStep: OrderStep;
  readonly actorId: string;
  readonly metadata?: Record<string, unknown>;
  readonly beforeCommit?: (order: Order, tx?: unknown) => Promise<void> | void;
}

export interface OrderRepository {
  create(params: CreateOrderParams, tx?: unknown): Promise<Order>;
  getById(orderId: string): Promise<Order | null>;
  getByOrderNumber(orderNumber: string): Promise<Order | null>;
  advanceWithLock(params: AdvanceOrderTransactionalParams, tx?: unknown): Promise<Order>;
  getTransitionHistory(orderId: string): Promise<readonly OrderTransition[]>;
}
