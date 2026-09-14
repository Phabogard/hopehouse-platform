import type { IncomingMessage, ServerResponse } from 'node:http';
import { ForbiddenError, UnauthorizedError, ValidationError, DomainError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import { handleWalletApi, type CreditWalletApiRequest, type WalletApiService } from './wallet-api.js';

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

/**
 * No prior HTTP idempotency-key convention exists anywhere else in this
 * project (checked: no `Idempotency-Key` header, no equivalent body field,
 * no correlation-id header in app.ts or any other HTTP adapter). This is
 * therefore the first use of this header in the codebase, using the
 * de facto standard header name (`Idempotency-Key`, used by most payment
 * APIs) rather than inventing a bespoke name. It should be reused as-is by
 * any future mutating endpoint that needs command-level idempotence.
 */
function idempotencyKey(request: IncomingMessage): string {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim().length === 0) {
    throw new ValidationError("L'en-tête Idempotency-Key est obligatoire");
  }
  return value;
}

export interface WalletHttpAuth {
  authenticateAccessToken(token: string): Promise<{ id: string; role: Actor['role'] }>;
}

export interface WalletHttpResult {
  readonly handled: boolean;
  readonly statusCode?: number;
}

export function parseWalletRequest(
  method: string | undefined,
  url: URL,
  key: string,
  body?: JsonObject,
): CreditWalletApiRequest | null {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'wallets') return null;

  if (segments.length === 3 && segments[2] === 'credit' && method === 'POST') {
    return { method: 'POST', resource: 'credit', walletId: segments[1], idempotencyKey: key, body };
  }

  return null;
}

export async function handleWalletHttp(
  auth: WalletHttpAuth,
  service: WalletApiService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<WalletHttpResult> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/wallets/')) return { handled: false };

  try {
    const body = request.method === 'POST' ? await readJsonBody(request) : undefined;
    const key = idempotencyKey(request);
    const walletRequest = parseWalletRequest(request.method, url, key, body);
    if (walletRequest === null) {
      sendJson(response, 404, { error: 'Route Wallet introuvable' });
      return { handled: true, statusCode: 404 };
    }

    let authenticated: { id: string; role: Actor['role'] };
    try {
      authenticated = await auth.authenticateAccessToken(bearerToken(request));
    } catch (error) {
      if (error instanceof ForbiddenError) throw new UnauthorizedError(error.message);
      throw error;
    }

    const result = await handleWalletApi({ id: authenticated.id, role: authenticated.role }, service, walletRequest);
    sendJson(response, result.statusCode, { data: result.data });
    return { handled: true, statusCode: result.statusCode };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      sendJson(response, 401, { error: error.message });
      return { handled: true, statusCode: 401 };
    }
    if (error instanceof ForbiddenError) {
      sendJson(response, 403, { error: error.message });
      return { handled: true, statusCode: 403 };
    }
    if (error instanceof ValidationError) {
      sendJson(response, 400, { error: error.message });
      return { handled: true, statusCode: 400 };
    }
    if (error instanceof DomainError && error.code === 'WALLET_CONFLICT') {
      sendJson(response, 409, { error: error.message });
      return { handled: true, statusCode: 409 };
    }
    throw error;
  }
}
