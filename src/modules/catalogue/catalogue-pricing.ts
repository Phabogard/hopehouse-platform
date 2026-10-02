import { ValidationError } from '../../core/errors.js';
import type { CatalogItem, PriceRule, ServiceDefinition } from './catalogue.js';

export interface CatalogueOrderPricingRepository {
  findServiceById(id: string): Promise<ServiceDefinition | null>;
  findItemById(id: string): Promise<CatalogItem | null>;
  findApplicablePriceRules(params: {
    serviceDefinitionId: string;
    catalogItemId: string;
    at: Date;
    currency?: string;
  }): Promise<readonly PriceRule[]>;
}

export interface ResolvedOrderPrice {
  readonly ruleId: string;
  readonly serviceDefinitionId: string;
  readonly catalogItemId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly resolvedAt: string;
}

function isValidNow(item: CatalogItem, at: Date): boolean {
  return (item.validFrom === null || item.validFrom <= at) && (item.validUntil === null || item.validUntil > at);
}

function toSafeNumber(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`Le prix catalogue ${amount.toString()} dépasse la précision monétaire sûre`);
  }
  return value;
}

export async function resolveOrderPrice(
  repository: CatalogueOrderPricingRepository,
  params: {
    serviceDefinitionId: string;
    catalogItemId: string;
    requestedAmountCents?: number;
    requestedCurrency?: string;
    at?: Date;
  },
): Promise<ResolvedOrderPrice> {
  const at = params.at ?? new Date();
  const service = await repository.findServiceById(params.serviceDefinitionId);
  if (service === null) throw new ValidationError('Service catalogue introuvable');
  if (service.status !== 'active') throw new ValidationError('Le service catalogue n’est pas actif');

  const item = await repository.findItemById(params.catalogItemId);
  if (item === null) throw new ValidationError('Item catalogue introuvable');
  if (item.serviceDefinitionId !== service.id) {
    throw new ValidationError('L’item catalogue n’appartient pas au service demandé');
  }
  if (item.status !== 'active') throw new ValidationError('L’item catalogue n’est pas actif');
  if (!isValidNow(item, at)) throw new ValidationError('L’item catalogue n’est pas dans sa période de validité');

  const requestedCurrency = params.requestedCurrency?.trim().toUpperCase();
  const rules = await repository.findApplicablePriceRules({
    serviceDefinitionId: service.id,
    catalogItemId: item.id,
    at,
    currency: requestedCurrency,
  });
  if (rules.length === 0) {
    throw new ValidationError('Aucun prix catalogue actif et applicable pour cette commande');
  }
  if (rules.length > 1) {
    throw new ValidationError('Plusieurs prix catalogue sont applicables simultanément; la configuration doit être corrigée');
  }

  const rule = rules[0];
  const amountCents = toSafeNumber(rule.amountCents);
  const currency = rule.currency.toUpperCase();

  if (requestedCurrency !== undefined && requestedCurrency !== currency) {
    throw new ValidationError('La devise demandée ne correspond pas au prix catalogue');
  }
  if (params.requestedAmountCents !== undefined && params.requestedAmountCents !== amountCents) {
    throw new ValidationError('Le montant demandé ne correspond pas au prix catalogue officiel');
  }

  return Object.freeze({
    ruleId: rule.id,
    serviceDefinitionId: service.id,
    catalogItemId: item.id,
    amountCents,
    currency,
    resolvedAt: at.toISOString(),
  });
}
