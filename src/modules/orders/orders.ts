import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export const orderCycle = ['creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit'] as const;

export type OrderStep = (typeof orderCycle)[number];
export type OrderMode = 'manual' | 'semi_automatic' | 'automatic';
export type OrderTransitionOutcome = 'succeeded' | 'failed';

export interface OrderActorRef {
  id: string;
}

export interface OrderConfigurationRef {
  serviceDefinitionId: string;
  mode: OrderMode;
}

export interface OrderMonetaryIntent {
  amountCents: number;
  currency: string;
}

export interface OrderTransition {
  readonly id: string;
  readonly orderId: string;
  readonly fromStep: OrderStep | null;
  readonly toStep: OrderStep;
  readonly outcome: OrderTransitionOutcome;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface Order {
  readonly id: string;
  readonly orderNumber: string;
  readonly currentStep: OrderStep;
  readonly configuration: Readonly<OrderConfigurationRef>;
  readonly requester: Readonly<OrderActorRef>;
  readonly beneficiaryId: string | null;
  readonly channel: string | null;
  readonly monetaryIntent: Readonly<OrderMonetaryIntent> | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly transitions: readonly OrderTransition[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOrderInput {
  requesterActorId: string;
  serviceDefinitionId: string;
  mode: OrderMode;
  beneficiaryId?: string | null;
  channel?: string | null;
  monetaryIntent?: OrderMonetaryIntent | null;
  metadata?: Record<string, unknown>;
}

export interface AdvanceOrderInput {
  order: Order;
  actorId: string;
  expectedFromStep: OrderStep;
  toStep: OrderStep;
  metadata?: Record<string, unknown>;
}

function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`Le champ ${fieldName} est obligatoire`);
  return trimmed;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function validateMode(mode: OrderMode): OrderMode {
  if (!['manual', 'semi_automatic', 'automatic'].includes(mode)) {
    throw new ValidationError('Le mode de commande est invalide');
  }
  return mode;
}

function validateMonetaryIntent(input: OrderMonetaryIntent | null | undefined): OrderMonetaryIntent | null {
  if (input === undefined || input === null) return null;
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) {
    throw new ValidationError('Le montant de commande doit être un entier positif ou nul');
  }
  if (input.currency.trim().length !== 3) {
    throw new ValidationError('La devise de commande doit utiliser un code à trois caractères');
  }
  return Object.freeze({ amountCents: input.amountCents, currency: input.currency.toUpperCase() });
}

function nextStepAfter(step: OrderStep): OrderStep | null {
  const currentIndex = orderCycle.indexOf(step);
  return orderCycle[currentIndex + 1] ?? null;
}

function freezeTransition(input: Omit<OrderTransition, 'metadata'> & { metadata?: Record<string, unknown> }): OrderTransition {
  return Object.freeze({ ...input, metadata: Object.freeze({ ...(input.metadata ?? {}) }) });
}

function freezeOrder(input: Omit<Order, 'configuration' | 'requester' | 'monetaryIntent' | 'metadata' | 'transitions'> & {
  configuration: OrderConfigurationRef;
  requester: OrderActorRef;
  monetaryIntent: OrderMonetaryIntent | null;
  metadata: Record<string, unknown>;
  transitions: readonly OrderTransition[];
}): Order {
  return Object.freeze({
    ...input,
    configuration: Object.freeze({ ...input.configuration }),
    requester: Object.freeze({ ...input.requester }),
    monetaryIntent: input.monetaryIntent === null ? null : Object.freeze({ ...input.monetaryIntent }),
    metadata: Object.freeze({ ...input.metadata }),
    transitions: Object.freeze([...input.transitions]),
  });
}

export function createOrder(input: CreateOrderInput): Order {
  const now = new Date().toISOString();
  const orderId = randomUUID();
  const requesterActorId = requireNonBlank(input.requesterActorId, 'requesterActorId');
  const initialTransition = freezeTransition({
    id: randomUUID(),
    orderId,
    fromStep: null,
    toStep: 'creation',
    outcome: 'succeeded',
    actorId: requesterActorId,
    occurredAt: now,
    metadata: { reason: 'order.created' },
  });

  return freezeOrder({
    id: orderId,
    orderNumber: orderId,
    currentStep: 'creation',
    configuration: {
      serviceDefinitionId: requireNonBlank(input.serviceDefinitionId, 'serviceDefinitionId'),
      mode: validateMode(input.mode),
    },
    requester: { id: requesterActorId },
    beneficiaryId: normalizeOptionalString(input.beneficiaryId),
    channel: normalizeOptionalString(input.channel),
    monetaryIntent: validateMonetaryIntent(input.monetaryIntent),
    metadata: input.metadata ?? {},
    transitions: [initialTransition],
    createdAt: now,
    updatedAt: now,
  });
}

export function assertOrderTransition(currentStep: OrderStep, toStep: OrderStep): void {
  const expectedNextStep = nextStepAfter(currentStep);
  if (expectedNextStep === null) {
    throw new ValidationError('La commande a déjà atteint le dernier état officiel');
  }
  if (toStep !== expectedNextStep) {
    throw new ValidationError(`Transition de commande invalide: ${currentStep} → ${toStep}`);
  }
}

export function advanceOrder(input: AdvanceOrderInput): Order {
  const actorId = requireNonBlank(input.actorId, 'actorId');
  if (input.expectedFromStep !== input.order.currentStep) {
    throw new ValidationError(`L'état courant de la commande est ${input.order.currentStep}`);
  }
  assertOrderTransition(input.order.currentStep, input.toStep);
  const now = new Date().toISOString();
  const transition = freezeTransition({
    id: randomUUID(),
    orderId: input.order.id,
    fromStep: input.order.currentStep,
    toStep: input.toStep,
    outcome: 'succeeded',
    actorId,
    occurredAt: now,
    metadata: input.metadata,
  });

  return freezeOrder({
    ...input.order,
    currentStep: input.toStep,
    transitions: [...input.order.transitions, transition],
    updatedAt: now,
  });
}

export function isOrderComplete(order: Order): boolean {
  return order.currentStep === 'audit';
}
