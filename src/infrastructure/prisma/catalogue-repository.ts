import { Prisma, type PrismaClient } from '@prisma/client';
import {
  assertValidCode,
  type Catalog,
  type CatalogItem,
  type CatalogRepository,
  type CatalogueItemStatus,
  type CreateCatalogInput,
  type CreateCatalogItemInput,
  type CreateServiceInput,
  type ServiceDefinition,
} from '../../modules/catalogue/catalogue.js';

type JsonObject = Record<string, unknown>;

function toJsonObject(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as JsonObject) };
}

function toInputJsonValue(value: JsonObject): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toCatalog(record: { id: string; code: string; name: string; type: string; status: Catalog['status']; metadata: unknown; createdAt: Date; updatedAt: Date }): Catalog {
  return Object.freeze({ id: record.id, code: record.code, name: record.name, type: record.type, status: record.status, metadata: Object.freeze(toJsonObject(record.metadata)), createdAt: record.createdAt, updatedAt: record.updatedAt });
}

function toCatalogItem(record: { id: string; catalogId: string; serviceDefinitionId: string | null; code: string; name: string; type: CatalogItem['type']; status: CatalogueItemStatus; metadata: unknown; validFrom: Date | null; validUntil: Date | null; createdByUserId: string | null; updatedByUserId: string | null; createdAt: Date; updatedAt: Date }): CatalogItem {
  return Object.freeze({ id: record.id, catalogId: record.catalogId, serviceDefinitionId: record.serviceDefinitionId, code: record.code, name: record.name, type: record.type, status: record.status, metadata: Object.freeze(toJsonObject(record.metadata)), validFrom: record.validFrom, validUntil: record.validUntil, createdByUserId: record.createdByUserId, updatedByUserId: record.updatedByUserId, createdAt: record.createdAt, updatedAt: record.updatedAt });
}

function toServiceDefinition(record: { id: string; code: string; name: string; type: ServiceDefinition['type']; networkId: string | null; providerId: string | null; status: ServiceDefinition['status']; metadata: unknown; createdAt: Date; updatedAt: Date }): ServiceDefinition {
  return Object.freeze({ id: record.id, code: record.code, name: record.name, type: record.type, networkId: record.networkId, providerId: record.providerId, status: record.status, metadata: Object.freeze(toJsonObject(record.metadata)), createdAt: record.createdAt, updatedAt: record.updatedAt });
}

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly client: PrismaClient) {}

  async findCatalogByCode(code: string): Promise<Catalog | null> {
    const record = await this.client.catalog.findUnique({ where: { code: assertValidCode(code) } });
    return record === null ? null : toCatalog(record);
  }

  async findCatalogById(id: string): Promise<Catalog | null> {
    const record = await this.client.catalog.findUnique({ where: { id } });
    return record === null ? null : toCatalog(record);
  }

  async findItemByCode(catalogId: string, code: string): Promise<CatalogItem | null> {
    const record = await this.client.catalogItem.findUnique({ where: { catalogId_code: { catalogId, code: assertValidCode(code) } } });
    return record === null ? null : toCatalogItem(record);
  }

  async listItems(catalogId: string, status?: CatalogueItemStatus): Promise<readonly CatalogItem[]> {
    const records = await this.client.catalogItem.findMany({ where: { catalogId, ...(status === undefined ? {} : { status }) }, orderBy: [{ name: 'asc' }, { code: 'asc' }] });
    return Object.freeze(records.map(toCatalogItem));
  }

  async findServiceByCode(code: string): Promise<ServiceDefinition | null> {
    const record = await this.client.serviceDefinition.findUnique({ where: { code: assertValidCode(code) } });
    return record === null ? null : toServiceDefinition(record);
  }

  async findServiceById(id: string): Promise<ServiceDefinition | null> {
    const record = await this.client.serviceDefinition.findUnique({ where: { id } });
    return record === null ? null : toServiceDefinition(record);
  }

  async createCatalog(input: CreateCatalogInput): Promise<Catalog> {
    const record = await this.client.catalog.create({ data: { id: input.id, code: assertValidCode(input.code), name: input.name.trim(), type: input.type.trim(), status: 'active', metadata: toInputJsonValue(input.metadata ?? {}) } });
    return toCatalog(record);
  }

  async createService(input: CreateServiceInput): Promise<ServiceDefinition> {
    const record = await this.client.serviceDefinition.create({ data: { id: input.id, code: assertValidCode(input.code), name: input.name.trim(), type: input.type, networkId: input.networkId ?? null, providerId: input.providerId ?? null, status: 'draft', metadata: toInputJsonValue(input.metadata ?? {}) } });
    return toServiceDefinition(record);
  }

  async createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
    const record = await this.client.catalogItem.create({ data: { id: input.id, catalogId: input.catalogId, serviceDefinitionId: input.serviceDefinitionId ?? null, code: assertValidCode(input.code), name: input.name.trim(), type: input.type, status: 'inactive', metadata: toInputJsonValue(input.metadata ?? {}), validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null, createdByUserId: input.actorUserId ?? null, updatedByUserId: input.actorUserId ?? null } });
    return toCatalogItem(record);
  }

  async setCatalogStatus(id: string, status: 'active' | 'inactive' | 'archived', _actorUserId: string): Promise<Catalog> {
    const record = await this.client.catalog.update({ where: { id }, data: { status, updatedAt: new Date() } });
    return toCatalog(record);
  }

  async setCatalogItemStatus(id: string, status: CatalogueItemStatus, actorUserId: string): Promise<CatalogItem> {
    const record = await this.client.catalogItem.update({ where: { id }, data: { status, updatedByUserId: actorUserId, updatedAt: new Date() } });
    return toCatalogItem(record);
  }

  async setServiceStatus(id: string, status: 'draft' | 'active' | 'inactive' | 'archived'): Promise<ServiceDefinition> {
    const record = await this.client.serviceDefinition.update({ where: { id }, data: { status, updatedAt: new Date() } });
    return toServiceDefinition(record);
  }
}
