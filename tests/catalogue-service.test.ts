import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogueService } from '../src/modules/catalogue/catalogue-service.js';
import type { Catalog, CatalogItem, CatalogRepository, ServiceDefinition } from '../src/modules/catalogue/catalogue.js';

const now = new Date('2026-08-22T00:00:00.000Z');

function fakeRepository(initial?: { catalog?: Catalog; service?: ServiceDefinition }): CatalogRepository {
  let catalog = initial?.catalog ?? null;
  let service = initial?.service ?? null;
  const items: CatalogItem[] = [];
  return {
    async findCatalogByCode(code) { return catalog?.code === code ? catalog : null; },
    async findCatalogById(id) { return catalog?.id === id ? catalog : null; },
    async findItemByCode(catalogId, code) { return items.find((item) => item.catalogId === catalogId && item.code === code) ?? null; },
    async listItems(catalogId) { return items.filter((item) => item.catalogId === catalogId); },
    async findServiceByCode(code) { return service?.code === code ? service : null; },
    async findServiceById(id) { return service?.id === id ? service : null; },
    async createCatalog(input) {
      catalog = { id: input.id, code: input.code, name: input.name, type: input.type, status: 'active', metadata: input.metadata ?? {}, createdAt: now, updatedAt: now };
      return catalog;
    },
    async createService(input) {
      service = { id: input.id, code: input.code, name: input.name, type: input.type, networkId: input.networkId ?? null, providerId: input.providerId ?? null, status: 'draft', metadata: input.metadata ?? {}, createdAt: now, updatedAt: now };
      return service;
    },
    async createCatalogItem(input) {
      const item: CatalogItem = { id: input.id, catalogId: input.catalogId, serviceDefinitionId: input.serviceDefinitionId ?? null, code: input.code, name: input.name, type: input.type, status: 'inactive', metadata: input.metadata ?? {}, validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null, createdByUserId: input.actorUserId ?? null, updatedByUserId: input.actorUserId ?? null, createdAt: now, updatedAt: now };
      items.push(item);
      return item;
    },
    async setCatalogStatus(_id, status) { assert.ok(catalog); catalog = { ...catalog, status, updatedAt: now }; return catalog; },
    async setCatalogItemStatus(id, status, actorUserId) { const item = items.find((entry) => entry.id === id); assert.ok(item); Object.assign(item, { status, updatedByUserId: actorUserId, updatedAt: now }); return item; },
    async setServiceStatus(id, status) { assert.ok(service && service.id === id); service = { ...service, status, updatedAt: now }; return service; },
  };
}

test('creates a catalog and rejects duplicate codes', async () => {
  const service = new CatalogueService(fakeRepository());
  await service.createCatalog({ id: 'cat-1', code: 'SERVICES', name: 'Services', type: 'service' });
  await assert.rejects(() => service.createCatalog({ id: 'cat-2', code: 'SERVICES', name: 'Duplicate', type: 'service' }), /already exists/);
});

test('creates a service and rejects a catalog item linked to an unknown service', async () => {
  const repo = fakeRepository({ catalog: { id: 'cat-1', code: 'SERVICES', name: 'Services', type: 'service', status: 'active', metadata: {}, createdAt: now, updatedAt: now } });
  const service = new CatalogueService(repo);
  await assert.rejects(() => service.createCatalogItem({ id: 'item-1', catalogId: 'cat-1', serviceDefinitionId: 'missing', code: 'PLAN_1GB', name: '1 GB', type: 'plan' }), /Service definition does not exist/);
});

test('rejects invalid validity windows before persistence', async () => {
  const repo = fakeRepository({ catalog: { id: 'cat-1', code: 'SERVICES', name: 'Services', type: 'service', status: 'active', metadata: {}, createdAt: now, updatedAt: now } });
  const service = new CatalogueService(repo);
  await assert.rejects(() => service.createCatalogItem({ id: 'item-1', catalogId: 'cat-1', code: 'PLAN_1GB', name: '1 GB', type: 'plan', validFrom: new Date('2026-09-01'), validUntil: new Date('2026-08-01') }), /validUntil/);
});

test('archives a catalog only once', async () => {
  const catalog: Catalog = { id: 'cat-1', code: 'SERVICES', name: 'Services', type: 'service', status: 'active', metadata: {}, createdAt: now, updatedAt: now };
  const service = new CatalogueService(fakeRepository({ catalog }));
  const archived = await service.archiveCatalog('cat-1', 'admin-1');
  assert.equal(archived.status, 'archived');
  await assert.rejects(() => service.archiveCatalog('cat-1', 'admin-1'), /cannot be archived again/);
});
