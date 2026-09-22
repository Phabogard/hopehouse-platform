import type { IncomingMessage, ServerResponse } from 'node:http';
import { ForbiddenError, UnauthorizedError, ValidationError, DomainError } from '../../core/errors.js';
import { authorize, type Actor } from '../rbac/authorize.js';
import type {
  ConfirmRechargeCommand,
  CreateRechargeCommand,
  MobileMoneyRechargeUseCase,
} from './mobile-money-recharge-use-case.js';

type JsonObject = Record<string, unknown>;
const maxJsonBodyBytes = 1_000_000;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    let receivedBytes = 0;
    let rawBody = '';
    request.on('data', (chunk: string | Buffer) => {
      const value = chunk.toString();
      receivedBytes += Buffer.byteLength(value);
      if (receivedBytes > maxJsonBodyBytes) {
        reject(new ValidationError('Le corps de la requête est trop volumineux'));
        return;
      }
      rawBody += value;
    });
    request.on('end', () => {
      try {
        const parsed: unknown = rawBody.length === 0 ? {} : JSON.parse(rawBody);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new ValidationError('Le corps JSON doit être un objet'));
          return;
        }
        resolve(parsed as JsonObject);
      } catch {
        reject(new ValidationError('Le corps de la requête doit être un JSON valide'));
      }
    });
    request.on('error', () => reject(new ValidationError('Impossible de lire le corps de la requête')));
  });
}

function bearerToken(request: IncomingMessage): string {
  const header = request.headers.authorization;
  if (header === undefined) throw new UnauthorizedError();
  const [scheme, token, extra] = header.split(' ');
  if (scheme !== 'Bearer' || token === undefined || token.trim().length === 0 || extra !== undefined) {
    throw new UnauthorizedError('Authorization Bearer invalide');
  }
  return token;
}

function idempotencyKey(request: IncomingMessage): string {
  const value = request.headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  if (key === undefined || key.trim().length === 0) {
    throw new ValidationError("L'en-tête Idempotency-Key est obligatoire");
  }
  return key;
}

function requiredString(body: JsonObject, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Le champ ${field} est obligatoire et doit être une chaîne non vide`);
  }
  return value;
}

function requiredAmount(body: JsonObject, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new ValidationError(`Le champ ${field} doit être un entier positif`);
  }
  return value;
}

function optionalString(body: JsonObject, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`Le champ ${field}, s'il est fourni, doit être une chaîne non vide`);
  }
  return value;
}

function optionalMetadata(body: JsonObject, field: string): Record<string, unknown> | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`Le champ ${field}, s'il est fourni, doit être un objet`);
  }
  return value as Record<string, unknown>;
}

export interface RechargeHttpAuth {
  authenticateAccessToken(token: string): Promise<{ id: string; role: Actor['role'] }>;
}

export async function handleMobileMoneyRechargeHttp(
  auth: RechargeHttpAuth,
  service: MobileMoneyRechargeUseCase,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'wallets' || segments[2] !== 'recharges') return false;

  try {
    let authenticated: { id: string; role: Actor['role'] };
    try {
      authenticated = await auth.authenticateAccessToken(bearerToken(request));
    } catch (error) {
      if (error instanceof ForbiddenError) throw new UnauthorizedError(error.message);
      throw error;
    }
    const actor: Actor = { id: authenticated.id, role: authenticated.role };
    const key = idempotencyKey(request);
    const body = await readJsonBody(request);

    if (request.method === 'POST' && segments.length === 3) {
      authorize(actor, 'wallets:recharge');
      const command: CreateRechargeCommand = {
        orderId: requiredString(body, 'orderId'),
        walletId: segments[1]!,
        amountCents: requiredAmount(body, 'amountCents'),
        currency: requiredString(body, 'currency'),
        network: requiredString(body, 'network'),
        externalReference: optionalString(body, 'externalReference'),
        metadata: optionalMetadata(body, 'metadata'),
        actorId: actor.id,
        idempotencyKey: key,
      };
      const result = await service.create(command);
      sendJson(response, result.replayed ? 200 : 201, { data: result.attempt });
      return true;
    }

    if (request.method === 'POST' && segments.length === 4 && segments[3] === 'confirm') {
      authorize(actor, 'wallets:reconcile');
      const command: ConfirmRechargeCommand = {
        attemptId: segments[3] === 'confirm' ? segments[2]! : '',
        confirmedAmountCents: requiredAmount(body, 'confirmedAmountCents'),
        confirmedCurrency: requiredString(body, 'confirmedCurrency'),
        externalReference: optionalString(body, 'externalReference'),
        reviewMetadata: optionalMetadata(body, 'reviewMetadata'),
        actorId: actor.id,
        idempotencyKey: key,
      };
      const result = await service.confirm(command);
      sendJson(response, result.replayed ? 200 : 201, { data: result.attempt });
      return true;
    }

    sendJson(response, 404, { error: 'Route Recharge Mobile Money introuvable' });
    return true;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      sendJson(response, 401, { error: error.message });
      return true;
    }
    if (error instanceof ForbiddenError) {
      sendJson(response, 403, { error: error.message });
      return true;
    }
    if (error instanceof ValidationError) {
      sendJson(response, 400, { error: error.message });
      return true;
    }
    if (error instanceof DomainError) {
      sendJson(response, error.statusCode, { error: error.message, code: error.code });
      return true;
    }
    throw error;
  }
}
