import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../src/core/errors.js';
import { resolveOrderPrice, type CatalogueOrderPricingRepository } from '../src/modules/catalogue/catalogue-pricing.js';
import type { CatalogItem, PriceRule, ServiceDefinition } from '../src/modules/catalogue/catalogue.js';

const service: ServiceDefinition = {
  id: 'service-1', code: 'MOBILE', name: 'Mobile', type: 'mobile_credit', networkId: null, providerId: null,
  status: 'active', metadata: {}, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const item: CatalogItem = {
  id: 'item-1', catalogId: 'catalog-1', serviceDefinitionId: service.id, code: 'MOBILE-5000', name: 'Mobile 5000', type: 'plan',
  status: 'active', metadata: {}, validFrom: null, validUntil: null, createdByUserId: null, updatedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const priceRule: PriceRule = {
  id: 'price-1', serviceDefinitionId: service.id, catalogItemId: item.id, currency: 'CDF', amountCents: 500000n,
  status: 'active', startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: null, metadata: {},
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function fakeRepository(rules: readonly PriceRule[] = [priceRule]): CatalogueOrderPricingRepository {
  return {
    async findServiceById() { return service; },
    async findItemById() { return item; },
    async findApplicablePriceRules() { return rules; },
  };
}

test('resolves the official catalogue amount and currency', async () => {
  const resolved = await resolveOrderPrice(fakeRepository(), {
    serviceDefinitionId: service.id,
    catalogItemId: item.id,
    requestedAmountCents: 500000,
    requestedCurrency: 'cdf',
    at: new Date('2026-09-27T10:00:00Z'),
  });
  assert.equal(resolved.amountCents, 500000);
  assert.equal(resolved.currency, 'CDF');
  assert.equal(resolved.ruleId, priceRule.id);
});

test('rejects a client amount that differs from the catalogue price', async () => {
  await assert.rejects(
    () => resolveOrderPrice(fakeRepository(), { serviceDefinitionId: service.id, catalogItemId: item.id, requestedAmountCents: 100 }),
    (error: unknown) => error instanceof ValidationError && error.message.includes('ne correspond pas au prix catalogue officiel'),
  );
});

test('rejects a client currency that differs from the catalogue price', async () => {
  await assert.rejects(
    () => resolveOrderPrice(fakeRepository(), { serviceDefinitionId: service.id, catalogItemId: item.id, requestedCurrency: 'USD' }),
    (error: unknown) => error instanceof ValidationError && error.message.includes('Aucun prix catalogue'),
  );
});

test('rejects ambiguous active catalogue pricing', async () => {
  await assert.rejects(
    () => resolveOrderPrice(fakeRepository([priceRule, { ...priceRule, id: 'price-2' }]), { serviceDefinitionId: service.id, catalogItemId: item.id }),
    (error: unknown) => error instanceof ValidationError && error.message.includes('Plusieurs prix catalogue'),
  );
});

test('rejects inactive catalogue items before pricing', async () => {
  const repository = fakeRepository();
  const inactiveItem = { ...item, status: 'inactive' as const };
  const repositoryWithInactiveItem: CatalogueOrderPricingRepository = {
    ...repository,
    async findItemById() { return inactiveItem; },
  };
  await assert.rejects(
    () => resolveOrderPrice(repositoryWithInactiveItem, { serviceDefinitionId: service.id, catalogItemId: item.id }),
    (error: unknown) => error instanceof ValidationError && error.message.includes('item catalogue n’est pas actif'),
  );
});
