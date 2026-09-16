import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresAuditLogRepository, PrismaAuditLogRepository } from '../src/infrastructure/prisma/audit-log-repository.js';
import { PrismaOrderRepository } from '../src/infrastructure/prisma/order-repository.js';
import { AuditLogService } from '../src/modules/audit/audit-log.js';
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
      name: 'Service Test Audit',
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
      name: 'Catalogue Test Audit',
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
      name: 'Article Test Audit',
      type: 'service',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    },
  });

  return { serviceId, catalogId, catalogItemId };
}

test('postgres audit repository: persistance directe et relecture depuis PostgreSQL', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PostgresAuditLogRepository(client);
  const service = new AuditLogService(repo);
  const auditId = randomUUID();

  try {
    const recorded = await service.record({
      actorUserId: 'actor-audit-test',
      action: 'test.direct_persist',
      entityType: 'test_entity',
      entityId: auditId,
      outcome: 'success',
      metadata: { key: 'value1', nested: { count: 42 } },
    });

    assert.ok(recorded.id);
    assert.equal(recorded.action, 'test.direct_persist');

    // Verification directe par SQL Prisma
    const rowInDb = await client.auditLog.findUnique({ where: { id: recorded.id } });
    assert.notEqual(rowInDb, null);
    assert.equal(rowInDb?.actorUserId, 'actor-audit-test');
    assert.equal(rowInDb?.action, 'test.direct_persist');
    assert.equal(rowInDb?.entityType, 'test_entity');
    assert.equal(rowInDb?.entityId, auditId);
    assert.equal(rowInDb?.outcome, 'success');
    assert.deepEqual(rowInDb?.metadata, { key: 'value1', nested: { count: 42 } });

    // Relecture via AuditLogRepository
    const list = await service.list({ entityId: auditId });
    assert.equal(list.length, 1);
    assert.equal(list[0]?.id, recorded.id);
    assert.deepEqual(list[0]?.metadata, { key: 'value1', nested: { count: 42 } });
  } finally {
    await client.$disconnect();
  }
});

test('postgres audit repository: filtres de recherche (actor, entityType, entityId, action, outcome)', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PostgresAuditLogRepository(client);
  const actor1 = `user-${randomUUID()}`;
  const actor2 = `user-${randomUUID()}`;
  const entityId1 = `entity-${randomUUID()}`;

  try {
    await repo.record({
      id: randomUUID(),
      actorUserId: actor1,
      action: 'order.create',
      entityType: 'order',
      entityId: entityId1,
      outcome: 'success',
      occurredAt: new Date().toISOString(),
      metadata: { step: 'creation' },
    });

    await repo.record({
      id: randomUUID(),
      actorUserId: actor1,
      action: 'order.transition',
      entityType: 'order',
      entityId: entityId1,
      outcome: 'success',
      occurredAt: new Date().toISOString(),
      metadata: { step: 'validation' },
    });

    await repo.record({
      id: randomUUID(),
      actorUserId: actor2,
      action: 'order.create',
      entityType: 'order',
      entityId: `entity-${randomUUID()}`,
      outcome: 'failure',
      occurredAt: new Date().toISOString(),
      metadata: { reason: 'invalid_param' },
    });

    // Filtre actor1
    const byActor1 = await repo.list({ actorUserId: actor1 });
    assert.equal(byActor1.length, 2);

    // Filtre entityId1
    const byEntity1 = await repo.list({ entityId: entityId1 });
    assert.equal(byEntity1.length, 2);

    // Filtre outcome failure
    const failures = await repo.list({ outcome: 'failure', actorUserId: actor2 });
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.actorUserId, actor2);
  } finally {
    await client.$disconnect();
  }
});

test('postgres audit repository: tri déterministe par occurredAt desc et id desc', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const repo = new PostgresAuditLogRepository(client);
  const entityId = `entity-sort-${randomUUID()}`;
  const sameTime = new Date('2026-09-10T10:00:00.000Z').toISOString();
  const id1 = `audit-sort-1-${randomUUID()}`;
  const id2 = `audit-sort-2-${randomUUID()}`;

  try {
    await repo.record({
      id: id1,
      actorUserId: 'actor-1',
      action: 'order.step',
      entityType: 'order',
      entityId,
      outcome: 'success',
      occurredAt: sameTime,
    });

    await repo.record({
      id: id2,
      actorUserId: 'actor-1',
      action: 'order.step',
      entityType: 'order',
      entityId,
      outcome: 'success',
      occurredAt: sameTime,
    });

    const results = await repo.list({ entityId });
    assert.equal(results.length, 2);
    const expectedFirst = id1 > id2 ? id1 : id2;
    const expectedSecond = id1 > id2 ? id2 : id1;
    assert.equal(results[0]?.id, expectedFirst); // id desc
    assert.equal(results[1]?.id, expectedSecond);
  } finally {
    await client.auditLog.deleteMany({ where: { entityId } });
    await client.$disconnect();
  }
});

test('postgres audit + order engine: création produit exactement UN audit order.create et une transition produit exactement UN audit order.transition', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const auditRepo = new PostgresAuditLogRepository(client);
  const orderRepo = new PrismaOrderRepository(client, auditRepo);
  const engine = new OrderEngine({}, orderRepo);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);
    const actorId = `actor-${randomUUID()}`;

    // 1. Création de commande
    const order = await engine.createPersisted({
      serviceDefinitionId: serviceId,
      mode: 'automatic',
      requesterActorId: actorId,
    });

    // Vérification: exactement UN audit order.create
    const auditLogsAfterCreate = await auditRepo.list({ entityId: order.id });
    assert.equal(auditLogsAfterCreate.length, 1);
    assert.equal(auditLogsAfterCreate[0]?.action, 'order.create');

    // 2. Transition de commande
    const validated = await engine.advance({
      order,
      actorId,
      toStep: 'validation',
      metadata: { approver: 'manager-1' },
    });

    // Verification: exactement DEUX audits au total (1 order.create + 1 order.transition)
    const auditLogsAfterTransition = await auditRepo.list({ entityId: order.id });
    assert.equal(auditLogsAfterTransition.length, 2);
    assert.equal(auditLogsAfterTransition[0]?.action, 'order.transition');
    assert.equal(auditLogsAfterTransition[0]?.metadata.toStep, 'validation');
    assert.equal(auditLogsAfterTransition[0]?.metadata.approver, 'manager-1');
    assert.equal(auditLogsAfterTransition[1]?.action, 'order.create');

    // Pas d audit en double
    const createLogs = auditLogsAfterTransition.filter((l) => l.action === 'order.create');
    const transitionLogs = auditLogsAfterTransition.filter((l) => l.action === 'order.transition');
    assert.equal(createLogs.length, 1);
    assert.equal(transitionLogs.length, 1);
  } finally {
    await client.$disconnect();
  }
});

test('postgres audit isolation: l audit d une commande A ne se mélange pas avec l audit d une commande B', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const auditRepo = new PostgresAuditLogRepository(client);
  const orderRepo = new PrismaOrderRepository(client, auditRepo);
  const engine = new OrderEngine({}, orderRepo);

  try {
    const { serviceId } = await createTestServiceAndCatalogItem(client);

    const orderA = await engine.createPersisted({
      serviceDefinitionId: serviceId,
      mode: 'manual',
      requesterActorId: 'actor-a',
    });

    const orderB = await engine.createPersisted({
      serviceDefinitionId: serviceId,
      mode: 'manual',
      requesterActorId: 'actor-b',
    });

    await engine.advance({ order: orderA, actorId: 'actor-a', toStep: 'validation' });

    const auditA = await auditRepo.list({ entityId: orderA.id });
    const auditB = await auditRepo.list({ entityId: orderB.id });

    assert.equal(auditA.length, 2); // create + transition
    assert.equal(auditB.length, 1); // create only

    assert.ok(auditA.every((log) => log.entityId === orderA.id));
    assert.ok(auditB.every((log) => log.entityId === orderB.id));
  } finally {
    await client.$disconnect();
  }
});

test('postgres audit rollback: annulation mid-transaction réelle de orders, order_transitions et audit_logs lors d une erreur', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const { serviceId } = await createTestServiceAndCatalogItem(client);
  const testOrderId = `rollback-test-${randomUUID()}`;
  const transitionId = `trans-rollback-${randomUUID()}`;
  const auditLogId = `audit-rollback-${randomUUID()}`;

  try {
    let thrown = false;
    try {
      await client.$transaction(async (tx) => {
        // 1. Insert order
        await tx.order.create({
          data: {
            id: testOrderId,
            orderNumber: testOrderId,
            currentStep: 'creation',
            serviceDefinitionId: serviceId,
            mode: 'manual',
            requesterActorId: 'actor-rollback',
            metadataJson: {},
          },
        });

        // 2. Insert order_transition
        await tx.orderTransition.create({
          data: {
            id: transitionId,
            orderId: testOrderId,
            fromStep: null,
            toStep: 'creation',
            outcome: 'succeeded',
            actorId: 'actor-rollback',
            metadataJson: {},
          },
        });

        // 3. Insert audit_log
        await tx.auditLog.create({
          data: {
            id: auditLogId,
            actorUserId: 'actor-rollback',
            action: 'order.create',
            entityType: 'order',
            entityId: testOrderId,
            outcome: 'success',
            occurredAt: new Date(),
            metadata: { test: 'rollback' },
          },
        });

        // 4. Force mid-transaction failure AFTER all three inserts
        throw new Error('deliberate-mid-transaction-failure');
      });
    } catch (err: any) {
      thrown = true;
      assert.equal(err.message, 'deliberate-mid-transaction-failure');
    }

    assert.equal(thrown, true, 'La transaction devait être interrompue');

    // Vérification dans PostgreSQL que 0 order, 0 order_transition et 0 audit_log subsistent
    const orderInDb = await client.order.findUnique({ where: { id: testOrderId } });
    assert.equal(orderInDb, null, 'Order ne doit pas exister en base (0 order)');

    const transitionInDb = await client.orderTransition.findUnique({ where: { id: transitionId } });
    assert.equal(transitionInDb, null, 'OrderTransition ne doit pas exister en base (0 order_transition)');

    const auditInDb = await client.auditLog.findUnique({ where: { id: auditLogId } });
    assert.equal(auditInDb, null, 'AuditLog ne doit pas exister en base (0 audit_log)');
  } finally {
    await client.$disconnect();
  }
});
