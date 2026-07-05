import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderEngine, advanceOrder, assertOrderTransition, createOrder, isOrderComplete, orderCycle, type OrderStep } from '../src/modules/orders/index.js';

test('order cycle exposes the official ordered states', () => {
  assert.equal(JSON.stringify(orderCycle), JSON.stringify(['creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit']));
});

test('createOrder creates a generic order at the creation step with immutable metadata and history', () => {
  const order = createOrder({
    requesterActorId: 'actor-1',
    serviceDefinitionId: 'service-definition-config-id',
    mode: 'manual',
    beneficiaryId: 'beneficiary-1',
    channel: 'web',
    monetaryIntent: { amountCents: 1500, currency: 'usd' },
    metadata: { configurableServiceCode: 'from-catalog' },
  });

  assert.equal(order.currentStep, 'creation');
  assert.equal(order.configuration.serviceDefinitionId, 'service-definition-config-id');
  assert.equal(order.configuration.mode, 'manual');
  assert.equal(order.monetaryIntent?.currency, 'USD');
  assert.equal(order.transitions.length, 1);
  assert.equal(order.transitions[0]?.fromStep, null);
  assert.equal(order.transitions[0]?.toStep, 'creation');

  assert.throws(() => {
    (order.metadata as Record<string, unknown>).configurableServiceCode = 'mutated';
  });
  assert.throws(() => {
    (order.transitions as unknown[]).push({});
  });
});

test('order state machine accepts only the official forward transition sequence', () => {
  const order = createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: 'service-definition-config-id', mode: 'semi_automatic' });

  assertOrderTransition('creation', 'validation');
  assert.throws(() => assertOrderTransition('creation', 'payment'), /Transition de commande invalide/);

  const validated = advanceOrder({ order, actorId: 'actor-2', expectedFromStep: 'creation', toStep: 'validation' });
  assert.equal(validated.currentStep, 'validation');
  assert.equal(validated.transitions.length, 2);
  assert.equal(validated.transitions[1]?.fromStep, 'creation');
  assert.equal(validated.transitions[1]?.toStep, 'validation');

  assert.throws(() => advanceOrder({ order: validated, actorId: 'actor-2', expectedFromStep: 'creation', toStep: 'payment' }), /L'état courant/);
  assert.throws(() => advanceOrder({ order: validated, actorId: 'actor-2', expectedFromStep: 'validation', toStep: 'notification' }), /Transition de commande invalide/);
});

test('OrderEngine runs generic handlers in sequence without embedding service-specific business logic', async () => {
  const visitedSteps: OrderStep[] = [];
  const engine = new OrderEngine({
    validation: ({ toStep }) => { visitedSteps.push(toStep); },
    payment: ({ toStep }) => { visitedSteps.push(toStep); },
    execution: ({ toStep }) => { visitedSteps.push(toStep); },
    notification: ({ toStep }) => { visitedSteps.push(toStep); },
    receipt: ({ toStep }) => { visitedSteps.push(toStep); },
    history: ({ toStep }) => { visitedSteps.push(toStep); },
    audit: ({ toStep }) => { visitedSteps.push(toStep); },
  });

  const order = engine.create({ requesterActorId: 'actor-1', serviceDefinitionId: 'configurable-service-definition', mode: 'automatic' });
  const completed = await engine.runToAudit({ order, actorId: 'system-orchestrator' });

  assert.equal(isOrderComplete(completed), true);
  assert.equal(completed.currentStep, 'audit');
  assert.equal(JSON.stringify(visitedSteps), JSON.stringify(['validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit']));
  assert.equal(JSON.stringify(completed.transitions.map((transition) => transition.toStep)), JSON.stringify(orderCycle));
});

test('OrderEngine stops if a step handler rejects before recording the transition', async () => {
  const engine = new OrderEngine({
    payment: () => {
      throw new Error('wallet-not-connected-yet');
    },
  });
  const order = engine.create({ requesterActorId: 'actor-1', serviceDefinitionId: 'configurable-service-definition', mode: 'manual' });
  const validated = await engine.advance({ order, actorId: 'actor-1', toStep: 'validation' });

  let rejected = false;
  try {
    await engine.advance({ order: validated, actorId: 'actor-1', toStep: 'payment' });
  } catch (error) {
    rejected = error instanceof Error && /wallet-not-connected-yet/.test(error.message);
  }
  assert.equal(rejected, true);
  assert.equal(validated.currentStep, 'validation');
  assert.equal(validated.transitions.length, 2);
});

test('createOrder rejects missing generic configuration and invalid monetary intent', () => {
  assert.throws(() => createOrder({ requesterActorId: '', serviceDefinitionId: 'service-definition-config-id', mode: 'manual' }), /requesterActorId/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: '', mode: 'manual' }), /serviceDefinitionId/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: 'service-definition-config-id', mode: 'manual', monetaryIntent: { amountCents: -1, currency: 'USD' } }), /montant/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: 'service-definition-config-id', mode: 'manual', monetaryIntent: { amountCents: 100, currency: 'US' } }), /devise/);
});
