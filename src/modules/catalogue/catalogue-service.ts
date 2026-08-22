import {
  assertCanTransitionToArchived,
  assertValidCode,
  assertValidDateRange,
  type Catalog,
  type CatalogItem,
  type CatalogRepository,
  type CreateCatalogInput,
  type CreateCatalogItemInput,
  type CreateServiceInput,
  type ServiceDefinition,
} from './catalogue.js';

export class CatalogueService {
  constructor(private readonly repository: CatalogRepository) {}

  async createCatalog(input: CreateCatalogInput): Promise<Catalog> {
    const code = assertValidCode(input.code);
    if (await this.repository.findCatalogByCode(code)) throw new Error(`Catalogue ${code} already exists.`);
    return this.repository.createCatalog({ ...input, code });
  }

  async createService(input: CreateServiceInput): Promise<ServiceDefinition> {
    const code = assertValidCode(input.code);
    if (await this.repository.findServiceByCode(code)) throw new Error(`Service ${code} already exists.`);
    return this.repository.createService({ ...input, code });
  }

  async createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
    const code = assertValidCode(input.code);
    assertValidDateRange(input.validFrom ?? null, input.validUntil ?? null);
    if (!(await this.repository.findCatalogById(input.catalogId))) throw new Error('Catalog does not exist.');
    if (await this.repository.findItemByCode(input.catalogId, code)) throw new Error(`Catalog item ${code} already exists.`);
    if (input.serviceDefinitionId !== undefined && input.serviceDefinitionId !== null) {
      const service = await this.repository.findServiceById(input.serviceDefinitionId);
      if (!service) throw new Error('Service definition does not exist.');
      if (service.status === 'archived') throw new Error('An archived service cannot receive new catalogue items.');
    }
    return this.repository.createCatalogItem({ ...input, code });
  }

  async archiveCatalog(id: string, actorUserId: string): Promise<Catalog> {
    const current = await this.repository.findCatalogById(id);
    if (!current) throw new Error('Catalog does not exist.');
    assertCanTransitionToArchived(current.status);
    return this.repository.setCatalogStatus(id, 'archived', actorUserId);
  }

  async setCatalogItemStatus(id: string, status: 'active' | 'inactive' | 'archived', actorUserId: string): Promise<CatalogItem> {
    return this.repository.setCatalogItemStatus(id, status, actorUserId);
  }

  async setServiceStatus(id: string, status: 'draft' | 'active' | 'inactive' | 'archived'): Promise<ServiceDefinition> {
    return this.repository.setServiceStatus(id, status);
  }
}
