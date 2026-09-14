import { ValidationError } from '../../core/errors.js';
import { authorize, type Actor } from '../rbac/authorize.js';
import type { CreditWalletCommand, CreditWalletResult, CreditWalletUseCase } from './credit-wallet-use-case.js';

export interface WalletApiService {
  creditWallet(command: CreditWalletCommand): Promise<CreditWalletResult>;
}

/** Adapts CreditWalletUseCase to the narrow interface this API layer needs. */
export function walletApiServiceFromUseCase(useCase: CreditWalletUseCase): WalletApiService {
  return {
    creditWallet: (command) => useCase.execute(command),
  };
}

export interface WalletApiResult<T> {
  readonly statusCode: 200 | 201;
  readonly data: T;
}

export interface CreditWalletApiRequest {
  readonly method: 'POST';
  readonly resource: 'credit';
  readonly walletId: string;
  readonly idempotencyKey: string;
  readonly body?: Record<string, unknown>;
}

function requireString(body: Record<string, unknown> | undefined, field: string): string {
  const value = body?.[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Le champ ${field} est obligatoire et doit être une chaîne non vide`);
  }
  return value;
}

function requireAmountCents(body: Record<string, unknown> | undefined): number {
  const value = body?.amountCents;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError('Le champ amountCents est obligatoire et doit être un entier positif');
  }
  return value;
}

function optionalString(body: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = body?.[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Le champ ${field}, s'il est fourni, doit être une chaîne non vide`);
  }
  return value;
}

function optionalMetadata(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const value = body?.metadata;
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Le champ metadata, si fourni, doit être un objet');
  }
  return value as Record<string, unknown>;
}

/**
 * Application-layer API dispatcher. HTTP adapters call this function after
 * authentication. Authorization is enforced here so callers cannot bypass
 * RBAC by hiding or omitting UI controls (same convention as the Catalogue
 * module — see catalogue-api.ts).
 */
export async function handleWalletApi(
  actor: Actor,
  service: WalletApiService,
  request: CreditWalletApiRequest,
): Promise<WalletApiResult<unknown>> {
  if (request.method === 'POST' && request.resource === 'credit') {
    authorize(actor, 'wallets:credit');

    const currency = requireString(request.body, 'currency');
    const amountCents = requireAmountCents(request.body);
    const transactionKey = optionalString(request.body, 'transactionKey');
    const relatedEntityType = optionalString(request.body, 'relatedEntityType');
    const relatedEntityId = optionalString(request.body, 'relatedEntityId');
    const metadata = optionalMetadata(request.body);

    const result = await service.creditWallet({
      walletId: request.walletId,
      currency,
      amountCents,
      actorId: actor.id,
      idempotencyKey: request.idempotencyKey,
      transactionKey,
      relatedEntityType,
      relatedEntityId,
      metadata,
    });

    return { statusCode: result.replayed ? 200 : 201, data: result.transaction };
  }

  throw new Error('Unsupported wallet API operation.');
}
