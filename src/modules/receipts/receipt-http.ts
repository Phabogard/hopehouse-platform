import type { IncomingMessage, ServerResponse } from 'node:http';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import type { ReceiptService } from './receipt-service.js';

export interface ReceiptHttpAuth {
  authenticateAccessToken(token: string): Promise<{ id: string; role: Actor['role'] }>;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
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

export async function handleReceiptHttp(
  auth: ReceiptHttpAuth,
  receiptService: ReceiptService,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<{ handled: boolean; statusCode?: number }> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] !== 'receipts') return { handled: false };

  if (request.method !== 'GET' || segments.length !== 2) {
    sendJson(response, 404, { error: 'Route Reçu introuvable' });
    return { handled: true, statusCode: 404 };
  }

  const receiptId = segments[1];

  try {
    const authenticated = await auth.authenticateAccessToken(bearerToken(request));
    const receipt = await receiptService.getReceiptForActor(receiptId, authenticated);
    sendJson(response, 200, { data: receipt });
    return { handled: true, statusCode: 200 };
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
      const statusCode = error.message.includes('introuvable') ? 404 : 400;
      sendJson(response, statusCode, { error: error.message });
      return { handled: true, statusCode };
    }
    throw error;
  }
}
