import type { IncomingMessage, ServerResponse } from 'node:http';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import { handleCatalogueApi, type CatalogueApiRequest, type CatalogueApiService } from './catalogue-api.js';

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

export interface CatalogueHttpAuth {
  authenticateAccessToken(token: string): Promise<{ id: string; role: Actor['role'] }>;
}

export interface CatalogueHttpResult {
  readonly handled: boolean;
  readonly statusCode?: number;
}

function parseCatalogueRequest(method: string | undefined, url: URL, body?: JsonObject): CatalogueApiRequest | null {
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] !== 'catalogue') return null;

  if (segments[1] === 'catalogs') {
    if (segments.length === 2 && method === 'GET') return { method: 'GET', resource: 'catalog', code: url.searchParams.get('code') ?? undefined };
    if (segments.length === 2 && method === 'POST') return { method: 'POST', resource: 'catalog', body };
    if (segments.length === 3 && method === 'PATCH') return { method: 'PATCH', resource: 'catalog', id: segments[2], body };
    if (segments.length === 3 && method === 'GET') return { method: 'GET', resource: 'catalog', id: segments[2] };
  }

  if (segments[1] === 'catalog-items') {
    if (segments.length === 2 && method === 'POST') return { method: 'POST', resource: 'catalog-items', body };
    if (segments.length === 2 && method === 'GET') return { method: 'GET', resource: 'catalog-items', id: url.searchParams.get('catalogId') ?? undefined, body: url.searchParams.has('status') ? { status: url.searchParams.get('status') } : undefined };
    if (segments.length === 3 && method === 'PATCH') return { method: 'PATCH', resource: 'catalog-items', id: segments[2], body };
  }

  if (segments[1] === 'services') {
    if (segments.length === 2 && method === 'POST') return { method: 'POST', resource: 'service', body };
    if (segments.length === 2 && method === 'GET') return { method: 'GET', resource: 'service', code: url.searchParams.get('code') ?? undefined };
    if (segments.length === 3 && method === 'GET') return { method: 'GET', resource: 'service', id: segments[2] };
    if (segments.length === 3 && method === 'PATCH') return { method: 'PATCH', resource: 'service', id: segments[2], body };
  }

  return null;
}

export async function handleCatalogueHttp(
  auth: CatalogueHttpAuth,
  service: CatalogueApiService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<CatalogueHttpResult> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/catalogue/')) return { handled: false };

  try {
    const body = request.method === 'POST' || request.method === 'PATCH' ? await readJsonBody(request) : undefined;
    const catalogueRequest = parseCatalogueRequest(request.method, url, body);
    if (catalogueRequest === null) {
      sendJson(response, 404, { error: 'Route Catalogue introuvable' });
      return { handled: true, statusCode: 404 };
    }

    const authenticated = await auth.authenticateAccessToken(bearerToken(request));
    const result = await handleCatalogueApi({ id: authenticated.id, role: authenticated.role }, service, catalogueRequest);
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
    throw error;
  }
}
