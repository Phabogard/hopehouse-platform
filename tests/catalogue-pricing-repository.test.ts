import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaCatalogRepository } from '../src/infrastructure/prisma/catalogue-repository.js';

test('PrismaCatalogRepository treats null startsAt as an already-active price boundary', async () => {
  let capturedWhere: any = null;

  const client = {
    priceRule: {
      async findMany({ where }: { where: any }) {
        capturedWhere = where;
        return [];
      },
    },
  } as any;

  const repository = new PrismaCatalogRepository(client);
  await repository.findApplicablePriceRules({
    serviceDefinitionId: 'service-1',
    catalogItemId: 'item-1',
    at: new Date('2026-09-28T12:00:00.000Z'),
    currency: 'CDF',
  });

  assert.deepEqual(capturedWhere.AND[0], {
    OR: [{ startsAt: null }, { startsAt: { lte: new Date('2026-09-28T12:00:00.000Z') } }],
  });
  assert.deepEqual(capturedWhere.AND[1], {
    OR: [{ endsAt: null }, { endsAt: { gt: new Date('2026-09-28T12:00:00.000Z') } }],
  });
});

test('PrismaCatalogRepository keeps item-level priority over service-level pricing', async () => {
  const calls: any[] = [];
  const client = {
    priceRule: {
      async findMany({ where }: { where: any }) {
        calls.push(where);
        if (where.catalogItemId === 'item-1') {
          return [{ id: 'item-price', serviceDefinitionId: 'service-1', catalogItemId: 'item-1', currency: 'CDF', amountCents: 1000n, status: 'active', startsAt: null, endsAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() }];
        }
        return [{ id: 'service-price', serviceDefinitionId: 'service-1', catalogItemId: null, currency: 'CDF', amountCents: 900n, status: 'active', startsAt: null, endsAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() }];
      },
    },
  } as any;

  const repository = new PrismaCatalogRepository(client);
  const rules = await repository.findApplicablePriceRules({
    serviceDefinitionId: 'service-1',
    catalogItemId: 'item-1',
    at: new Date('2026-09-28T12:00:00.000Z'),
    currency: 'CDF',
  });

  assert.equal(rules.length, 1);
  assert.equal(rules[0]?.id, 'item-price');
  assert.equal(calls.length, 1);
});
