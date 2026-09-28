import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderEngine, advanceOrder, assertOrderTransition, createOrder, isOrderComplete, orderCycle, type OrderStep } from '../src/modules/orders/index.js';
import { toSafeBigIntCents, fromSafeBigIntCents } from '../src/infrastructure/prisma/order-repository.js';
import type { OrderRepository } from '../src/modules/orders/order-repository.js';
import type { CatalogueOrderPricingRepository } from '../src/modules/catalogue/catalogue-pricing.js';
import type { CatalogItem, PriceRule, ServiceDefinition } from '../src/modules/catalogue/catalogue.js';

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


test('OrderEngine resolves catalogue pricing inside the same persistence transaction as order creation', async () => {
  const service: ServiceDefinition = {
    id: 'service-tx', code: 'TX', name: 'Transactional service', type: 'mobile_credit', networkId: null, providerId: null,
    status: 'active', metadata: {}, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const item: CatalogItem = {
    id: 'item-tx', catalogId: 'catalog-tx', serviceDefinitionId: service.id, code: 'TX-ITEM', name: 'Transactional item', type: 'plan',
    status: 'active', metadata: {}, validFrom: null, validUntil: null, createdByUserId: null, updatedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const rule: PriceRule = {
    id: 'price-tx', serviceDefinitionId: service.id, catalogItemId: item.id, currency: 'CDF', amountCents: 500000n,
    status: 'active', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: null, metadata: {},
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  let transactionActive = false;
  let factoryCalledInsideTransaction = false;
  let pricingCalledInsideTransaction = false;
  let repositoryCreateTx: unknown;
  const transactionClient = { name: 'tx-client' };

  const pricingRepository = (tx: unknown): CatalogueOrderPricingRepository => ({
    async findServiceById() { pricingCalledInsideTransaction ||= transactionActive && tx === transactionClient; return service; },
    async findItemById() { pricingCalledInsideTransaction ||= transactionActive && tx === transactionClient; return item; },
    async findApplicablePriceRules() { pricingCalledInsideTransaction ||= transactionActive && tx === transactionClient; return [rule]; },
  });

  const orderRepository: OrderRepository = {
    async create(params, tx) {
      repositoryCreateTx = tx;
      return createOrder({
        requesterActorId: params.requesterActorId,
        serviceDefinitionId: params.serviceDefinitionId,
        catalogItemId: params.catalogItemId,
        mode: params.mode,
        beneficiaryId: params.beneficiaryId ?? undefined,
        channel: params.channel ?? undefined,
        monetaryIntent: params.amountCents === undefined || params.amountCents === null || params.currency === undefined || params.currency === null
          ? undefined
          : { amountCents: Number(params.amountCents), currency: params.currency },
        metadata: params.metadata,
      });
    },
    async getById() { return null; },
    async getByOrderNumber() { return null; },
    async advanceWithLock() { throw new Error('not used'); },
    async getTransitionHistory() { return []; },
  };

  const engine = new OrderEngine({}, orderRepository, {
    prisma: {
      async $transaction(fn) {
        transactionActive = true;
        try { return await fn(transactionClient); } finally { transactionActive = false; }
      },
    },
    idempotencyStore: { async find() { return null; }, async save() { return true; } },
    createIdempotencyStore: () => ({ async find() { return null; }, async save() { return true; } }),
    createPricingRepository: (tx) => { factoryCalledInsideTransaction ||= transactionActive && tx === transactionClient; return pricingRepository(tx); },
  });

  const order = await engine.createPersisted({
    requesterActorId: 'actor-tx', serviceDefinitionId: service.id, catalogItemId: item.id, mode: 'manual',
    monetaryIntent: { amountCents: 500000, currency: 'CDF' },
  });

  assert.equal(factoryCalledInsideTransaction, true);
  assert.equal(pricingCalledInsideTransaction, true);
  assert.equal(repositoryCreateTx, transactionClient);
  assert.equal(order.monetaryIntent?.amountCents, 500000);
  assert.equal(order.monetaryIntent?.currency, 'CDF');
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

test('OrderEngine runToAudit reprend depuis le currentStep réel', async () => {
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

  const order = engine.create({ requesterActorId: 'actor-1', serviceDefinitionId: 'configurable-service-definition', mode: 'manual' });
  const validated = await engine.advance({ order, actorId: 'actor-1', toStep: 'validation' });
  const paid = await engine.advance({ order: validated, actorId: 'actor-1', toStep: 'payment' });

  // runToAudit must resume from 'payment' and execute 'execution' -> ... -> 'audit'
  visitedSteps.length = 0; // reset
  const completed = await engine.runToAudit({ order: paid, actorId: 'system-orchestrator' });

  assert.equal(isOrderComplete(completed), true);
  assert.equal(completed.currentStep, 'audit');
  assert.equal(JSON.stringify(visitedSteps), JSON.stringify(['execution', 'notification', 'receipt', 'history', 'audit']));
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

test('toSafeBigIntCents et fromSafeBigIntCents refusent les montants hors plage sûre', () => {
  const UNSAFE_BIGINT = 9007199254740993n; // MAX_SAFE_INTEGER + 2
  const SAFE_BIGINT = 9007199254740991n; // MAX_SAFE_INTEGER

  assert.throws(() => toSafeBigIntCents(UNSAFE_BIGINT), /hors de la plage sûre/);
  assert.throws(() => toSafeBigIntCents(-10n), /hors de la plage sûre/);
  assert.throws(() => toSafeBigIntCents(9007199254740993), /entier positif ou nul/);
  assert.throws(() => fromSafeBigIntCents(UNSAFE_BIGINT), /hors de la plage sûre/);

  assert.equal(toSafeBigIntCents(SAFE_BIGINT), SAFE_BIGINT);
  assert.equal(fromSafeBigIntCents(SAFE_BIGINT), 9007199254740991);
  assert.equal(toSafeBigIntCents(100n), 100n);
  assert.equal(toSafeBigIntCents(100), 100n);
  assert.equal(toSafeBigIntCents(null), null);
  assert.equal(fromSafeBigIntCents(null), null);
});

test('createOrder rejects missing generic configuration and invalid monetary intent', () => {
  assert.throws(() => createOrder({ requesterActorId: '', serviceDefinitionId: 'service-definition-config-id', mode: 'manual' }), /requesterActorId/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: '', mode: 'manual' }), /serviceDefinitionId/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: 'service-definition-config-id', mode: 'manual', monetaryIntent: { amountCents: -1, currency: 'USD' } }), /montant/);
  assert.throws(() => createOrder({ requesterActorId: 'actor-1', serviceDefinitionId: 'service-definition-config-id', mode: 'manual', monetaryIntent: { amountCents: 100, currency: 'US' } }), /devise/);
});
