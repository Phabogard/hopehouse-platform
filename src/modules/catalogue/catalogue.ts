export type CatalogueStatus = 'active' | 'inactive' | 'archived';
export type CatalogueItemType = 'service' | 'plan' | 'unit' | 'accessory' | 'other';
export type CatalogueItemStatus = CatalogueStatus;
export type ServiceDefinitionStatus = 'draft' | CatalogueStatus;
export type ServiceDefinitionType =
  | 'mobile_credit'
  | 'internet'
  | 'voice'
  | 'sms'
  | 'electricity'
  | 'tv'
  | 'accessory'
  | 'ai'
  | 'messaging'
  | 'other';
export type ServiceModeType = 'manual' | 'semi_automatic' | 'automatic';
export type CatalogueCurrency = 'USD' | 'CDF';
export type PriceRuleStatus = CatalogueStatus;
export type CommissionRuleStatus = CatalogueStatus;
export type CommissionCalculationType = 'fixed' | 'percentage';

export interface Catalog {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: string;
  readonly status: CatalogueStatus;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CatalogItem {
  readonly id: string;
  readonly catalogId: string;
  readonly serviceDefinitionId: string | null;
  readonly code: string;
  readonly name: string;
  readonly type: CatalogueItemType;
  readonly status: CatalogueItemStatus;
  readonly metadata: Record<string, unknown>;
  readonly validFrom: Date | null;
  readonly validUntil: Date | null;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly type: ServiceDefinitionType;
  readonly networkId: string | null;
  readonly providerId: string | null;
  readonly status: ServiceDefinitionStatus;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ServiceMode {
  readonly id: string;
  readonly serviceDefinitionId: string;
  readonly mode: ServiceModeType;
  readonly isActive: boolean;
  readonly configuration: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PriceRule {
  readonly id: string;
  readonly serviceDefinitionId: string;
  readonly catalogItemId: string | null;
  readonly currency: CatalogueCurrency;
  readonly amountCents: number;
  readonly status: PriceRuleStatus;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommissionRule {
  readonly id: string;
  readonly serviceDefinitionId: string;
  readonly catalogItemId: string | null;
  readonly currency: CatalogueCurrency;
  readonly calculationType: CommissionCalculationType;
  readonly value: number;
  readonly status: CommissionRuleStatus;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CatalogRepository {
  findCatalogByCode(code: string): Promise<Catalog | null>;
  findItemByCode(catalogId: string, code: string): Promise<CatalogItem | null>;
  listItems(catalogId: string, status?: CatalogueItemStatus): Promise<readonly CatalogItem[]>;
  findServiceByCode(code: string): Promise<ServiceDefinition | null>;
}

export function assertValidCode(code: string): string {
  const normalized = code.trim();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(normalized)) {
    throw new Error('Catalogue code must contain only uppercase letters, digits, dots, underscores, or hyphens.');
  }
  return normalized;
}

export function assertValidDateRange(validFrom: Date | null, validUntil: Date | null): void {
  if (validFrom !== null && validUntil !== null && validUntil <= validFrom) {
    throw new Error('validUntil must be later than validFrom.');
  }
}

export function assertNonNegativeAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error('Amount must be a non-negative safe integer in cents.');
  }
}
