import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AuditLogService } from './modules/audit/audit-log.js';
import { createBeneficiary } from './modules/beneficiaries/beneficiaries.js';
import { createInvoice } from './modules/invoices/invoices.js';
import { createPayment } from './modules/payments/payments.js';
import { authorize, type Actor } from './modules/rbac/authorize.js';
import { createServiceOffering } from './modules/services/services.js';
import { createSubscription } from './modules/subscriptions/subscriptions.js';
import { createUser } from './modules/users/users.js';

const audit = new AuditLogService();

const demoActor: Actor = { id: 'system', role: 'system_admin' };

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function createHopeHouseServer() {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { data: { status: 'ok', service: 'hopehouse-platform' } });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/users') {
        authorize(demoActor, 'users:read');
        sendJson(response, 200, { data: [createUser({ email: 'admin@hopehouse.local', displayName: 'System Admin', role: 'system_admin' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/beneficiaries') {
        authorize(demoActor, 'beneficiaries:read');
        sendJson(response, 200, { data: [createBeneficiary({ reference: 'BEN-001', displayName: 'Bénéficiaire de démonstration' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/services') {
        authorize(demoActor, 'services:read');
        sendJson(response, 200, { data: [createServiceOffering({ name: 'Service de démonstration', isBillable: true })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        authorize(demoActor, 'subscriptions:read');
        sendJson(response, 200, { data: [createSubscription({ beneficiaryId: 'BEN-001', serviceId: 'SVC-001', startDate: '2026-01-01' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/payments') {
        authorize(demoActor, 'payments:read');
        sendJson(response, 200, { data: [createPayment({ beneficiaryId: 'BEN-001', amountCents: 10000, currency: 'USD', paymentMethod: 'manual' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/invoices') {
        authorize(demoActor, 'invoices:read');
        sendJson(response, 200, { data: [createInvoice({ beneficiaryId: 'BEN-001', totalCents: 10000, currency: 'USD' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/audit-logs') {
        authorize(demoActor, 'audit:read');
        audit.record({ actorUserId: demoActor.id, action: 'audit.list', entityType: 'audit_log', entityId: 'collection', outcome: 'success' });
        sendJson(response, 200, { data: audit.list() });
        return;
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
      const message = error instanceof Error ? error.message : 'Erreur interne';
      sendJson(response, statusCode, { error: { message } });
    }
  });
}
