import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { ForbiddenError, UnauthorizedError } from '../src/core/errors.js';
import { handleCatalogueHttp, parseCatalogueRequest } from '../src/modules/catalogue/catalogue-http.js';
import type { CatalogueApiService } from '../src/modules/catalogue/catalogue-api.js';

const service: CatalogueApiService = {
  getCatalogById: async (id) => ({ id }),
  getCatalogByCode: async (code) => ({ code }),
  listCatalogItems: async (catalogId) => [{ catalogId }],
  getServiceById: async (id) => ({ id }),
  getServiceByCode: async (code) => ({ code }),
  createCatalog: async (input) => input,
  createService: async (input) => input,
  createCatalogItem: async (input) => input,
  archiveCatalog: async (id) => ({ id }),
  setCatalogItemStatus: async (id, status) => ({ id, status }),
  setServiceStatus: async (id, status) => ({ id, status }),
};

function request(method: string, url: string, authorization = 'Bearer token'): EventEmitter & { method: string; url: string; headers: Record<string, string> } {
  const value = new EventEmitter() as EventEmitter & { method: string; url: string; headers: Record<string, string> };
  value.method = method;
  value.url = url;
  value.headers = { authorization };
  return value;
}

function response(): { writeHead(statusCode: number, headers: Record<string, string>): void; end(body: string): void; statusCode?: number; body?: string } {
  return {
    writeHead(statusCode, _headers) { this.statusCode = statusCode; },
    end(body) { this.body = body; },
  };
}

test('catalogue HTTP parser maps catalog and service resources', () => {
  assert.deepEqual(parseCatalogueRequest('GET', new URL('http://localhost/catalogue/catalogs/cat-1')), {
    method: 'GET', resource: 'catalog', id: 'cat-1',
  });
  assert.deepEqual(parseCatalogueRequest('GET', new URL('http://localhost/catalogue/services?code=energy')), {
    method: 'GET', resource: 'service', code: 'energy',
  });
});

test('catalogue HTTP adapter authenticates before invoking RBAC', async () => {
  const auth = { authenticateAccessToken: async (token: string) => {
    assert.equal(token, 'token');
    return { id: 'admin-1', role: 'business_admin' as const };
  } };
  const output = response();
  const result = await handleCatalogueHttp(auth, service, request('GET', '/catalogue/catalogs/cat-1'), output as never);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(output.body ?? '{}'), { data: { id: 'cat-1' } });
});

test('catalogue HTTP adapter returns 401 when authentication fails', async () => {
  const auth = { authenticateAccessToken: async () => { throw new UnauthorizedError(); } };
  const output = response();
  const result = await handleCatalogueHttp(auth, service, request('GET', '/catalogue/catalogs/cat-1'), output as never);
  assert.equal(result.statusCode, 401);
});

test('catalogue HTTP adapter maps forbidden catalogue operations to 403', async () => {
  const auth = { authenticateAccessToken: async () => ({ id: 'agent-1', role: 'operations_agent' as const }) };
  const output = response();
  const body = JSON.stringify({ id: 'cat-1', code: 'CAT', name: 'Catalogue', type: 'service' });
  const input = request('POST', '/catalogue/catalogs');
  queueMicrotask(() => { input.emit('data', Buffer.from(body)); input.emit('end'); });
  const result = await handleCatalogueHttp(auth, service, input, output as never);
  assert.equal(result.statusCode, 403);
});

test('catalogue HTTP adapter converts authentication ForbiddenError into 401', async () => {
  const auth = { authenticateAccessToken: async () => { throw new ForbiddenError(); } };
  const output = response();
  const result = await handleCatalogueHttp(auth, service, request('GET', '/catalogue/catalogs/cat-1'), output as never);
  assert.equal(result.statusCode, 401);
});
