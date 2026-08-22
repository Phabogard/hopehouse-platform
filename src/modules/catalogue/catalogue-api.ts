import { authorize, type Actor } from '../rbac/authorize.js';
import type {
  CatalogueItemStatus,
  CatalogueService,
  CreateCatalogInput,
  CreateCatalogItemInput,
  CreateServiceInput,
  ServiceDefinitionStatus,
} from './catalogue-types.js';

export interface CatalogueApiResult<T> {
  readonly statusCode: 200 | 201;
  readonly data: T;
}

export interface CatalogueApiService {
  getCatalogById(id: string): Promise<unknown>;
  getCatalogByCode(code: string): Promise<unknown>;
  listCatalogItems(catalogId: string, status?: CatalogueItemStatus): Promise<readonly unknown[]>;
  getServiceById(id: string): Promise<unknown>;
  getServiceByCode(code: string): Promise<unknown>;
  createCatalog(input: CreateCatalogInput): Promise<unknown>;
  createService(input: CreateServiceInput): Promise<unknown>;
  createCatalogItem(input: CreateCatalogItemInput): Promise<unknown>;
  archiveCatalog(id: string, actorUserId: string): Promise<unknown>;
  setCatalogItemStatus(id: string, status: CatalogueItemStatus, actorUserId: string): Promise<unknown>;
  setServiceStatus(id: string, status: ServiceDefinitionStatus): Promise<unknown>;
}

export interface CatalogueApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly resource: 'catalog' | 'catalog-items' | 'service';
  readonly id?: string;
  readonly code?: string;
  readonly body?: Record<string, unknown>;
}

/**
 * Application-layer API dispatcher. HTTP adapters call this function after
 * authentication. Authorization is enforced here so callers cannot bypass
 * RBAC by hiding or omitting UI controls.
 */
export async function handleCatalogueApi(
  actor: Actor,
  service: CatalogueApiService,
  request: CatalogueApiRequest,
): Promise<CatalogueApiResult<unknown>> {
  if (request.method === 'GET' && request.resource === 'catalog') {
    authorize(actor, 'catalogue:read');
    if (request.id) return { statusCode: 200, data: await service.getCatalogById(request.id) };
    if (request.code) return { statusCode: 200, data: await service.getCatalogByCode(request.code) };
    throw new Error('Catalog id or code is required.');
  }

  if (request.method === 'GET' && request.resource === 'catalog-items') {
    authorize(actor, 'catalogue:read');
    if (!request.id) throw new Error('Catalog id is required.');
    const status = request.body?.status;
    if (status !== undefined && !['active', 'inactive', 'archived'].includes(String(status))) throw new Error('Invalid catalogue item status.');
    return { statusCode: 200, data: await service.listCatalogItems(request.id, status as CatalogueItemStatus | undefined) };
  }

  if (request.method === 'GET' && request.resource === 'service') {
    authorize(actor, 'catalogue:read');
    if (request.id) return { statusCode: 200, data: await service.getServiceById(request.id) };
    if (request.code) return { statusCode: 200, data: await service.getServiceByCode(request.code) };
    throw new Error('Service id or code is required.');
  }

  if (request.method === 'POST' && request.resource === 'catalog') {
    authorize(actor, 'catalogue:manage');
    return { statusCode: 201, data: await service.createCatalog(request.body as unknown as CreateCatalogInput) };
  }

  if (request.method === 'POST' && request.resource === 'service') {
    authorize(actor, 'catalogue:service:manage');
    return { statusCode: 201, data: await service.createService(request.body as unknown as CreateServiceInput) };
  }

  if (request.method === 'POST' && request.resource === 'catalog-items') {
    authorize(actor, 'catalogue:manage');
    return { statusCode: 201, data: await service.createCatalogItem(request.body as unknown as CreateCatalogItemInput) };
  }

  if (request.method === 'PATCH' && request.resource === 'catalog' && request.id) {
    const action = request.body?.action;
    if (action === 'archive') {
      authorize(actor, 'catalogue:archive');
      return { statusCode: 200, data: await service.archiveCatalog(request.id, actor.id) };
    }
  }

  if (request.method === 'PATCH' && request.resource === 'catalog-items' && request.id) {
    authorize(actor, 'catalogue:activate');
    const status = request.body?.status;
    if (!['active', 'inactive', 'archived'].includes(String(status))) throw new Error('Invalid catalogue item status.');
    return { statusCode: 200, data: await service.setCatalogItemStatus(request.id, status as CatalogueItemStatus, actor.id) };
  }

  if (request.method === 'PATCH' && request.resource === 'service' && request.id) {
    authorize(actor, 'catalogue:service:manage');
    const status = request.body?.status;
    if (!['draft', 'active', 'inactive', 'archived'].includes(String(status))) throw new Error('Invalid service status.');
    return { statusCode: 200, data: await service.setServiceStatus(request.id, status as ServiceDefinitionStatus) };
  }

  throw new Error('Unsupported catalogue API operation.');
}
