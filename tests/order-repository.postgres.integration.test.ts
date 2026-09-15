import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaOrderRepository } from '../src/infrastructure/prisma/order-repository.js';
import { OrderEngine } from '../src/modules/orders/order-engine.js';
import { ValidationError } from '../src/core/errors.js';

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

async function createTestServiceAndCatalogItem(client: PrismaClient) {
  const serviceId = `svc-${randomUUID()}`;
  const catalogId = `cat-${randomUUID()}`;
  const catalogItemId = `item-${randomUUID()}`;

  await client.serviceDefinition.create({
    data: {
      id: serviceId,
      code: `CODE-${serviceId}`,
      name: 'Service Test Order',
      type: 'mobile_credit',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalog.create({
    data: {
      id: catalogId,
      code: `CAT-${catalogId}`,
      name: 'Catalogue Test Order',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalogItem.create({
    data: {
      id: catalogItemId,
      catalogId,
      serviceDefinitionId: serviceId,
      code: `ITEM-${catalogItemId}`,
      name: 'Article Test Order',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  return { serviceId, catalogId, catalogItemId };
}

async function createMismatchedCatalogItem(client: PrismaClient) {
  const otherServiceId = `svc-${randomUUID()}`;
  const catalogId = `cat-${randomUUID()}`;
  const otherItemId = `item-${randomUUID()}`;

  await client.serviceDefinition.create({
    data: {
      id: otherServiceId,
      code: `CODE-${otherServiceId}`,
      name: 'Autre Service',
      type: 'internet',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalog.create({
    data: {
      id: catalogId,
      code: `CAT-${catalogId}`,
      name: 'Autre Catalogue',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  await client.catalogItem.create({
    data: {
      id: otherItemId,
      catalogId,
      serviceDefinitionId: otherServiceId,
      code: `ITEM-${otherItemId}`,
      name: 'Autre Article',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  return { otherServiceId, otherItemId };
}

test('order repository: création et persistance complète de la commande et de sa transition initiale', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaOrderRepository(client);

  try {
    const { serviceId, catalogItemId } = await createTestServiceAndCatalogItem(client);
    const orderId = `ord-${randomUUID()}`;
    const requesterActorId = `actor-${randomUUID()}`;

    const order = await repo.create({
      id: orderId,
      serviceDefinitionId: serviceId,
      catalogItemId,
      mode: 'automatic',
      requesterActorId,
      beneficiaryId: 'ben-1',
      channel: 'mobile_app',
      amountCents: 2500n,
      currency: 'USD',
      metadata: { testKey: 'val' },
    });

    assert.equal(order.id, orderId);
    assert.equal(order.currentStep, 'creation');
    assert.equal(order.configuration.serviceDefinitionId, serviceId);
    assert.equal(order.configuration.catalogItemId, catalogItemId);
    assert.equal(order.configuration.mode, 'automatic');
    assert.equal(order.monetaryIntent?.amountCents, 2500);
    assert.equal(order.monetaryIntent?.currency, 'USD');
    assert.equal(order.transitions.length, 1);
    assert.equal(order.transitions[0]?.fromStep, null);
    assert.equal(order.transitions[0]?.toStep, 'creation');

    // Verification en base
    const reloaded = await repo.getById(orderId);
    assert.notEqual(reloaded, null);
    assert.equal(reloaded?.id, orderId);
    assert.equal(reloaded?.currentStep, 'creation');
  } finally {
    await client.$disconnect();
  }
});

test('order repository: intégrité Catalogue → Order (rejet DB en cas d\'incohérence entre serviceDefinitionId et catalogItemId)', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaOrderRepository(client);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const { otherItemId } = await createMismatchedCatalogItem(client);

    // Tentative d'associer serviceId A avec d'otherItemId appartenant à Service B
    let rejected = false;
    try {
      await repo.create({
        serviceDefinitionId: serviceId,
        catalogItemId: otherItemId, // Mismatched!
        mode: 'manual',
        requesterActorId: 'actor-1',
      });
    } catch (err: any) {
      rejected = true;
      // Foreign key constraint violation expected
      assert.match(err.message, /foreign key|constraint|P2003/i);
    }

    assert.equal(rejected, true, 'La création doit échouer en raison de la contrainte FK composite cross-table');
  } finally {
    await client.$disconnect();
  }
});

test('order repository: avancement séquentiel des transitions avec verrou de ligne et historique immutable', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PrismaOrderRepository(client);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const order = await repo.create({
      serviceDefinitionId: serviceId,
      mode: 'semi_automatic',
      requesterActorId: 'actor-init',
    });

    const step1 = await repo.advanceWithLock({
      orderId: order.id,
      expectedFromStep: 'creation',
      toStep: 'validation',
      actorId: 'actor-validator',
      metadata: { validatedBy: 'manager' },
    });

    assert.equal(step1.currentStep, 'validation');
    assert.equal(step1.transitions.length, 2);

    const step2 = await repo.advanceWithLock({
      orderId: order.id,
      expectedFromStep: 'validation',
      toStep: 'payment',
      actorId: 'actor-payment',
    });

    assert.equal(step2.currentStep, 'payment');
    assert.equal(step2.transitions.length, 3);

    const history = await repo.getTransitionHistory(order.id);
    assert.equal(history.length, 3);
    assert.equal(history[0]?.toStep, 'creation');
    assert.equal(history[1]?.toStep, 'validation');
    assert.equal(history[2]?.toStep, 'payment');
  } finally {
    await client.$disconnect();
  }
});

test('order repository: concurrence d\'avancement sur la même commande rejetée proprement', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo1 = new PrismaOrderRepository(client);
  const client2 = integrationClient();
  const repo2 = new PrismaOrderRepository(client2);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const order = await repo1.create({
      serviceDefinitionId: serviceId,
      mode: 'automatic',
      requesterActorId: 'actor-init',
    });

    // Deux tentatives simultanées de passer de 'creation' à 'validation'
    const [res1, res2] = await Promise.allSettled([
      repo1.advanceWithLock({
        orderId: order.id,
        expectedFromStep: 'creation',
        toStep: 'validation',
        actorId: 'actor-a',
      }),
      repo2.advanceWithLock({
        orderId: order.id,
        expectedFromStep: 'creation',
        toStep: 'validation',
        actorId: 'actor-b',
      }),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactement une des deux requêtes concurrentes doit réussir');
    assert.equal(rejected.length, 1, 'L\'autre doit échouer en conflit d\'état');

    const finalOrder = await repo1.getById(order.id);
    assert.equal(finalOrder?.currentStep, 'validation');
    assert.equal(finalOrder?.transitions.length, 2);
  } finally {
    await client.$disconnect();
    await client2.$disconnect();
  }
});
