import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ValidationError } from './core/errors.js';
import { AuditLogService } from './modules/audit/audit-log.js';
import { createBeneficiary } from './modules/beneficiaries/beneficiaries.js';
import { createInvoice } from './modules/invoices/invoices.js';
import { createPayment } from './modules/payments/payments.js';
import { authorize, type Actor } from './modules/rbac/authorize.js';
import { createServiceOffering } from './modules/services/services.js';
import { createSubscription } from './modules/subscriptions/subscriptions.js';
import { createUser } from './modules/users/users.js';

const audit = new AuditLogService();

const demoReadActor: Actor = { id: 'system', role: 'system_admin' };
const demoBeneficiaryWriteActor: Actor = { id: 'business-demo', role: 'business_admin' };
const demoPaymentWriteActor: Actor = { id: 'finance-demo', role: 'finance_manager' };
const maxJsonBodyBytes = 1_000_000;

type JsonObject = Record<string, unknown>;

interface SensitiveAuditContext {
  actor: Actor;
  action: string;
  entityType: string;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function stringField(body: JsonObject, fieldName: string): string {
  const value = body[fieldName];
  if (typeof value !== 'string') throw new ValidationError(`Le champ ${fieldName} est obligatoire`);
  return value;
}

function optionalStringField(body: JsonObject, fieldName: string): string | null {
  const value = body[fieldName];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`Le champ ${fieldName} doit être une chaîne de caractères`);
  return value;
}

function integerField(body: JsonObject, fieldName: string): number {
  const value = body[fieldName];
  if (!Number.isInteger(value)) throw new ValidationError(`Le champ ${fieldName} doit être un entier`);
  return Number(value);
}

function sensitiveAuditContext(method: string | undefined, pathname: string): SensitiveAuditContext | null {
  if (method === 'POST' && pathname === '/beneficiaries') {
    return { actor: demoBeneficiaryWriteActor, action: 'beneficiary.create', entityType: 'beneficiary' };
  }

  if (method === 'POST' && pathname === '/payments') {
    return { actor: demoPaymentWriteActor, action: 'payment.create', entityType: 'payment' };
  }

  return null;
}

function readJsonBody(request: IncomingMessage): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    let receivedBytes = 0;
    let rawBody = '';

    request.on('data', (chunk: string | Buffer) => {
      const chunkAsString = chunk.toString();
      receivedBytes += Buffer.byteLength(chunkAsString);
      if (receivedBytes > maxJsonBodyBytes) {
        reject(new ValidationError('Le corps de la requête est trop volumineux'));
        return;
      }
      rawBody += chunkAsString;
    });

    request.on('end', () => {
      try {
        const parsedBody: unknown = rawBody.length > 0 ? JSON.parse(rawBody) : {};
        if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
          reject(new ValidationError('Le corps JSON doit être un objet'));
          return;
        }
        resolve(parsedBody as JsonObject);
      } catch {
        reject(new ValidationError('Le corps de la requête doit être un JSON valide'));
      }
    });

    request.on('error', () => reject(new ValidationError('Impossible de lire le corps de la requête')));
  });
}

export function createHopeHouseServer() {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    const auditContext = sensitiveAuditContext(request.method, url.pathname);

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { data: { status: 'ok', service: 'hopehouse-platform' } });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/users') {
        authorize(demoReadActor, 'users:read');
        sendJson(response, 200, { data: [createUser({ email: 'admin@hopehouse.local', displayName: 'System Admin', role: 'system_admin' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/beneficiaries') {
        authorize(demoReadActor, 'beneficiaries:read');
        sendJson(response, 200, { data: [createBeneficiary({ reference: 'BEN-001', displayName: 'Bénéficiaire de démonstration' })] });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/beneficiaries') {
        authorize(demoBeneficiaryWriteActor, 'beneficiaries:manage');
        const body = await readJsonBody(request);
        const beneficiary = createBeneficiary({ reference: stringField(body, 'reference'), displayName: stringField(body, 'displayName') });
        audit.record({ actorUserId: demoBeneficiaryWriteActor.id, action: 'beneficiary.create', entityType: 'beneficiary', entityId: beneficiary.id, outcome: 'success' });
        sendJson(response, 201, { data: beneficiary });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/services') {
        authorize(demoReadActor, 'services:read');
        sendJson(response, 200, { data: [createServiceOffering({ name: 'Service de démonstration', isBillable: true })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        authorize(demoReadActor, 'subscriptions:read');
        sendJson(response, 200, { data: [createSubscription({ beneficiaryId: 'BEN-001', serviceId: 'SVC-001', startDate: '2026-01-01' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/payments') {
        authorize(demoReadActor, 'payments:read');
        sendJson(response, 200, { data: [createPayment({ beneficiaryId: 'BEN-001', amountCents: 10000, currency: 'USD', paymentMethod: 'manual' })] });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/payments') {
        authorize(demoPaymentWriteActor, 'payments:create');
        const body = await readJsonBody(request);
        const payment = createPayment({
          beneficiaryId: stringField(body, 'beneficiaryId'),
          amountCents: integerField(body, 'amountCents'),
          currency: stringField(body, 'currency'),
          paymentMethod: optionalStringField(body, 'paymentMethod'),
        });
        audit.record({ actorUserId: demoPaymentWriteActor.id, action: 'payment.create', entityType: 'payment', entityId: payment.id, outcome: 'success' });
        sendJson(response, 201, { data: payment });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/invoices') {
        authorize(demoReadActor, 'invoices:read');
        sendJson(response, 200, { data: [createInvoice({ beneficiaryId: 'BEN-001', totalCents: 10000, currency: 'USD' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/audit-logs') {
        authorize(demoReadActor, 'audit:read');
        audit.record({ actorUserId: demoReadActor.id, action: 'audit.list', entityType: 'audit_log', entityId: 'collection', outcome: 'success' });
        sendJson(response, 200, { data: audit.list() });
        return;
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
      const message = error instanceof Error ? error.message : 'Erreur interne';

      if (auditContext !== null) {
        audit.record({
          actorUserId: auditContext.actor.id,
          action: auditContext.action,
          entityType: auditContext.entityType,
          entityId: 'collection',
          outcome: 'failure',
          metadata: { method: request.method ?? 'UNKNOWN', path: url.pathname, statusCode, message },
        });
      }

      sendJson(response, statusCode, { error: { message } });
    }
  });
}
