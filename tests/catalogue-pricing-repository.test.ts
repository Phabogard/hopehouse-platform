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

test('PrismaCatalogRepository returns both applicable scopes so the resolver can reject an undefined priority', async () => {
  const client = {
    priceRule: {
      async findMany({ where }: { where: any }) {
        assert.deepEqual(where.OR, [{ catalogItemId: 'item-1' }, { catalogItemId: null }]);
        return [
          { id: 'item-price', serviceDefinitionId: 'service-1', catalogItemId: 'item-1', currency: 'CDF', amountCents: 1000n, status: 'active', startsAt: null, endsAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() },
          { id: 'service-price', serviceDefinitionId: 'service-1', catalogItemId: null, currency: 'CDF', amountCents: 900n, status: 'active', startsAt: null, endsAt: null, metadata: {}, createdAt: new Date(), updatedAt: new Date() },
        ];
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

  assert.equal(rules.length, 2);
  assert.deepEqual(rules.map((rule) => rule.id), ['item-price', 'service-price']);
});
