import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ForbiddenError, UnauthorizedError, ValidationError } from './core/errors.js';
import { AuditLogService } from './modules/audit/audit-log.js';
import { createBeneficiary } from './modules/beneficiaries/beneficiaries.js';
import { createInvoice } from './modules/invoices/invoices.js';
import { createPayment } from './modules/payments/payments.js';
import { OrderEngine, orderCycle, type Order, type OrderMode, type OrderStep } from './modules/orders/index.js';
import { authorize, type Actor } from './modules/rbac/authorize.js';
import { createServiceOffering } from './modules/services/services.js';
import { createSubscription } from './modules/subscriptions/subscriptions.js';
import { createUser } from './modules/users/users.js';
import { AuthRuntimeContext, type AuthenticatedActor, type AuthenticatedLoginResult, type AuthRuntimeOptions } from './modules/auth-security/index.js';
import { OpenAiResponsesClient, resolveLiveAiPolicy, type AiChatProvider } from './modules/ai-assistant/openai.js';

const orderEngine = new OrderEngine();
const orders = new Map<string, Order>();

const maxJsonBodyBytes = 1_000_000;

type JsonObject = Record<string, unknown>;

interface SensitiveAuditContext {
  actorUserId: string;
  action: string;
  entityType: string;
}

type AuthRuntime = {
  login(input: {
    identifier: string;
    password: string;
    device?: { fingerprint?: string | null; userAgent?: string | null; ipAddress?: string | null; metadata?: Record<string, unknown> } | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuthenticatedLoginResult>;
  authenticateAccessToken(token: string): Promise<AuthenticatedActor>;
};

export interface HopeHouseServerOptions {
  readonly auth?: AuthRuntimeOptions;
  readonly authRuntime?: AuthRuntime | null;
  readonly aiClient?: AiChatProvider;
  readonly audit?: AuditLogService;
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

function optionalObjectField(body: JsonObject, fieldName: string): Record<string, unknown> | null {
  const value = body[fieldName];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`Le champ ${fieldName} doit être un objet`);
  return value as Record<string, unknown>;
}

function orderModeField(body: JsonObject, fieldName: string): OrderMode {
  const value = stringField(body, fieldName);
  if (!['manual', 'semi_automatic', 'automatic'].includes(value)) throw new ValidationError(`Le champ ${fieldName} est invalide`);
  return value as OrderMode;
}

function orderStepField(body: JsonObject, fieldName: string): OrderStep {
  const value = stringField(body, fieldName);
  if (!(orderCycle as readonly string[]).includes(value)) throw new ValidationError(`Le champ ${fieldName} est invalide`);
  return value as OrderStep;
}

function optionalDeviceContext(body: JsonObject): { fingerprint?: string | null; userAgent?: string | null; ipAddress?: string | null; metadata?: Record<string, unknown> } | null {
  const device = optionalObjectField(body, 'device');
  if (device === null) return null;
  return {
    fingerprint: optionalStringField(device, 'fingerprint'),
    userAgent: optionalStringField(device, 'userAgent'),
    ipAddress: optionalStringField(device, 'ipAddress'),
    metadata: optionalObjectField(device, 'metadata') ?? undefined,
  };
}

function requireAuthContext(auth: AuthRuntime | null): AuthRuntime {
  if (auth === null) throw new ValidationError('Le contexte d’authentification doit être configuré');
  return auth;
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

async function authenticatedActor(auth: AuthRuntime | null, request: IncomingMessage): Promise<Actor> {
  if (auth === null) throw new UnauthorizedError('Authentification non configurée');
  try {
    const actor = await auth.authenticateAccessToken(bearerToken(request));
    return { id: actor.id, role: actor.role };
  } catch (error) {
    if (error instanceof ForbiddenError) throw new UnauthorizedError(error.message);
    throw error;
  }
}

function requireAuthenticatedActor(actor: Actor | null): Actor {
  if (actor === null) throw new UnauthorizedError();
  return actor;
}

function isProtectedRoute(method: string | undefined, pathname: string): boolean {
  if (method === 'POST' && pathname === '/orders') return true;
  if (method === 'POST' && pathname.match(/^\/orders\/[^/]+\/transitions$/) !== null) return true;
  if (method === 'GET' && ['/users', '/beneficiaries', '/services', '/subscriptions', '/payments', '/invoices', '/audit-logs'].includes(pathname)) return true;
  if (method === 'POST' && ['/beneficiaries', '/payments', '/ai/chat'].includes(pathname)) return true;
  return false;
}

function sensitiveAuditContext(method: string | undefined, pathname: string, actor: Actor | null): SensitiveAuditContext | null {
  if (actor === null) return null;

  if (method === 'POST' && pathname === '/beneficiaries') return { actorUserId: actor.id, action: 'beneficiary.create', entityType: 'beneficiary' };
  if (method === 'POST' && pathname === '/payments') return { actorUserId: actor.id, action: 'payment.create', entityType: 'payment' };
  if (method === 'POST' && pathname === '/orders') return { actorUserId: actor.id, action: 'order.create', entityType: 'order' };
  if (method === 'POST' && pathname.match(/^\/orders\/[^/]+\/transitions$/) !== null) return { actorUserId: actor.id, action: 'order.transition', entityType: 'order' };
  if (method === 'POST' && pathname === '/ai/chat') return { actorUserId: actor.id, action: 'ai.chat', entityType: 'ai_session' };

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

export function createHopeHouseServer(options: HopeHouseServerOptions = {}) {
  const auth = options.authRuntime !== undefined
    ? options.authRuntime
    : options.auth === undefined && process.env.HOPEHOUSE_JWT_SECRET === undefined ? null : new AuthRuntimeContext(options.auth);
  const aiClient = options.aiClient ?? new OpenAiResponsesClient();
  const audit = options.audit ?? new AuditLogService();

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    let actor: Actor | null = null;
    let auditContext: SensitiveAuditContext | null = null;

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { data: { status: 'ok', service: 'hopehouse-platform' } });
      return;
    }

    try {
      if (request.method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJsonBody(request);
        const login = await requireAuthContext(auth).login({
          identifier: stringField(body, 'identifier'),
          password: stringField(body, 'password'),
          device: optionalDeviceContext(body),
          metadata: optionalObjectField(body, 'metadata') ?? undefined,
        });
        sendJson(response, 200, { data: login });
        return;
      }

      if (isProtectedRoute(request.method, url.pathname)) {
        actor = await authenticatedActor(auth, request);
        auditContext = sensitiveAuditContext(request.method, url.pathname, actor);
      }

      if (request.method === 'POST' && url.pathname === '/ai/chat') {
        const currentActor = requireAuthenticatedActor(actor);
        const body = await readJsonBody(request);
        const result = await aiClient.chat(currentActor, stringField(body, 'message'), resolveLiveAiPolicy(currentActor));
        await audit.record({ actorUserId: currentActor.id, action: 'ai.chat', entityType: 'ai_session', entityId: 'conversation', outcome: 'success' });
        sendJson(response, 200, { data: result });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/orders') {
        const currentActor = requireAuthenticatedActor(actor);
        const body = await readJsonBody(request);
        const monetaryIntent = optionalObjectField(body, 'monetaryIntent');
        const order = orderEngine.create({
          requesterActorId: currentActor.id,
          serviceDefinitionId: stringField(body, 'serviceDefinitionId'),
          mode: orderModeField(body, 'mode'),
          beneficiaryId: optionalStringField(body, 'beneficiaryId'),
          channel: optionalStringField(body, 'channel'),
          monetaryIntent: monetaryIntent === null ? null : { amountCents: integerField(monetaryIntent, 'amountCents'), currency: stringField(monetaryIntent, 'currency') },
          metadata: optionalObjectField(body, 'metadata') ?? undefined,
        });
        orders.set(order.id, order);
        await audit.record({ actorUserId: currentActor.id, action: 'order.create', entityType: 'order', entityId: order.id, outcome: 'success' });
        sendJson(response, 201, { data: order });
        return;
      }

      if (request.method === 'POST' && url.pathname.match(/^\/orders\/[^/]+\/transitions$/) !== null) {
        const currentActor = requireAuthenticatedActor(actor);
        const orderId = url.pathname.split('/')[2];
        const order = orders.get(orderId);
        if (order === undefined) throw new ValidationError('Commande introuvable');
        const body = await readJsonBody(request);
        const advancedOrder = await orderEngine.advance({
          order,
          actorId: currentActor.id,
          toStep: orderStepField(body, 'toStep'),
          metadata: optionalObjectField(body, 'metadata') ?? undefined,
        });
        orders.set(advancedOrder.id, advancedOrder);
        await audit.record({ actorUserId: currentActor.id, action: 'order.transition', entityType: 'order', entityId: advancedOrder.id, outcome: 'success', metadata: { toStep: advancedOrder.currentStep } });
        sendJson(response, 200, { data: advancedOrder });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/users') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'users:read');
        sendJson(response, 200, { data: [createUser({ email: 'admin@hopehouse.local', displayName: 'System Admin', role: 'system_admin' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/beneficiaries') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'beneficiaries:read');
        sendJson(response, 200, { data: [createBeneficiary({ reference: 'BEN-001', displayName: 'Bénéficiaire de démonstration' })] });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/beneficiaries') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'beneficiaries:manage');
        const body = await readJsonBody(request);
        const beneficiary = createBeneficiary({ reference: stringField(body, 'reference'), displayName: stringField(body, 'displayName') });
        await audit.record({ actorUserId: currentActor.id, action: 'beneficiary.create', entityType: 'beneficiary', entityId: beneficiary.id, outcome: 'success' });
        sendJson(response, 201, { data: beneficiary });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/services') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'services:read');
        sendJson(response, 200, { data: [createServiceOffering({ name: 'Service de démonstration', isBillable: true })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/subscriptions') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'subscriptions:read');
        sendJson(response, 200, { data: [createSubscription({ beneficiaryId: 'BEN-001', serviceId: 'SVC-001', startDate: '2026-01-01' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/payments') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'payments:read');
        sendJson(response, 200, { data: [createPayment({ beneficiaryId: 'BEN-001', amountCents: 10000, currency: 'USD', paymentMethod: 'manual' })] });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/payments') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'payments:create');
        const body = await readJsonBody(request);
        const payment = createPayment({
          beneficiaryId: stringField(body, 'beneficiaryId'),
          amountCents: integerField(body, 'amountCents'),
          currency: stringField(body, 'currency'),
          paymentMethod: optionalStringField(body, 'paymentMethod'),
        });
        await audit.record({ actorUserId: currentActor.id, action: 'payment.create', entityType: 'payment', entityId: payment.id, outcome: 'success' });
        sendJson(response, 201, { data: payment });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/invoices') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'invoices:read');
        sendJson(response, 200, { data: [createInvoice({ beneficiaryId: 'BEN-001', totalCents: 10000, currency: 'USD' })] });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/audit-logs') {
        const currentActor = requireAuthenticatedActor(actor);
        authorize(currentActor, 'audit:read');
        await audit.record({ actorUserId: currentActor.id, action: 'audit.list', entityType: 'audit_log', entityId: 'collection', outcome: 'success' });
        sendJson(response, 200, { data: await audit.list() });
        return;
      }

      sendJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Route introuvable' } });
    } catch (error) {
      const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
      const message = error instanceof Error ? error.message : 'Erreur interne';

      if (auditContext !== null) {
        await audit.record({
          actorUserId: auditContext.actorUserId,
          action: auditContext.action,
          entityType: auditContext.entityType,
          entityId: 'collection',
          outcome: 'failure',
          metadata: { method: request.method ?? 'UNKNOWN', path: url.pathname, statusCode, message },
        });
      }

      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'INTERNAL_ERROR';
      sendJson(response, statusCode, { error: { code, message } });
    }
  });
}
