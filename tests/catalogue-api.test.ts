import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../src/core/errors.js';
import { handleCatalogueApi, type CatalogueApiService } from '../src/modules/catalogue/catalogue-api.js';
import type { Actor } from '../src/modules/rbac/authorize.js';

const service: CatalogueApiService = {
  getCatalogById: async (id) => ({ id }),
  getCatalogByCode: async (code) => ({ code }),
  listCatalogItems: async () => [],
  getServiceById: async (id) => ({ id }),
  getServiceByCode: async (code) => ({ code }),
  createCatalog: async (input) => input,
  createService: async (input) => input,
  createCatalogItem: async (input) => input,
  archiveCatalog: async (id) => ({ id }),
  setCatalogItemStatus: async (id, status) => ({ id, status }),
  setServiceStatus: async (id, status) => ({ id, status }),
};

describe('catalogue API RBAC', () => {
  it('allows an operations agent to read catalogue data', async () => {
    const actor: Actor = { id: 'agent-1', role: 'operations_agent' };
    await expect(handleCatalogueApi(actor, service, { method: 'GET', resource: 'catalog', id: 'cat-1' })).resolves.toEqual({
      statusCode: 200,
      data: { id: 'cat-1' },
    });
  });

  it('denies an operations agent from creating a catalogue', async () => {
    const actor: Actor = { id: 'agent-1', role: 'operations_agent' };
    await expect(handleCatalogueApi(actor, service, {
      method: 'POST',
      resource: 'catalog',
      body: { id: 'cat-1', code: 'CATALOGUE', name: 'Catalogue', type: 'service' },
    })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a business admin to manage catalogue resources', async () => {
    const actor: Actor = { id: 'admin-1', role: 'business_admin' };
    await expect(handleCatalogueApi(actor, service, {
      method: 'POST',
      resource: 'catalog',
      body: { id: 'cat-1', code: 'CATALOGUE', name: 'Catalogue', type: 'service' },
    })).resolves.toEqual({
      statusCode: 201,
      data: { id: 'cat-1', code: 'CATALOGUE', name: 'Catalogue', type: 'service' },
    });
  });

  it('denies a client from reading catalogue administration data', async () => {
    const actor: Actor = { id: 'client-1', role: 'client' };
    await expect(handleCatalogueApi(actor, service, { method: 'GET', resource: 'catalog', id: 'cat-1' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
