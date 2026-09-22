import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHopeHouseServer } from '../../app.js';
import { AuditLogService } from '../../modules/audit/audit-log.js';
import { CatalogueService } from '../../modules/catalogue/catalogue-service.js';
import { handleCatalogueHttp } from '../../modules/catalogue/catalogue-http.js';
import { CreditWalletUseCase } from '../../modules/wallets/credit-wallet-use-case.js';
import { PrismaWalletRepository } from '../../modules/wallets/prisma-wallet-repository.js';
import { handleWalletHttp } from '../../modules/wallets/wallet-http.js';
import { walletApiServiceFromUseCase, type WalletApiService } from '../../modules/wallets/wallet-api.js';
import { PrismaAuditLogRepository, PostgresAuditLogRepository } from './audit-log-repository.js';
import { PrismaAuthRuntimeContext, resolvePrismaAuthSecurityPolicy, type PrismaAuthRuntimeClient, type PrismaAuthRuntimeOptions } from './auth-runtime.js';
import { PrismaCatalogRepository } from './catalogue-repository.js';
import { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
import { PostgresIdempotencyStore } from './idempotency-store.js';
import { PostgresOutboxStore } from '../outbox/postgres-outbox-store.js';
import type { DomainEventEnvelope } from '../../core/events/domain-event.js';
import { OutboxRelay } from '../../core/outbox/outbox.js';
import { OutboxWorker } from '../../core/outbox/outbox-worker.js';
import { WalletNotFoundError } from '../../modules/wallets/prisma-wallet-repository.js';
import { PrismaOrderRepository } from './order-repository.js';
import { OrderEngine } from '../../modules/orders/order-engine.js';
import { MobileMoneyRechargeUseCase } from '../../modules/wallets/mobile-money-recharge-use-case.js';
import { handleMobileMoneyRechargeHttp } from '../../modules/wallets/mobile-money-recharge-http.js';
import { PrismaReceiptRepository } from './receipt-repository.js';
import { ReceiptService } from '../../modules/receipts/receipt-service.js';
import { handleReceiptHttp } from '../../modules/receipts/receipt-http.js';
import { OutboxNotificationPublisher } from '../../modules/notifications/outbox-notification-publisher.js';
import { RechargeNotificationConsumer } from '../../modules/notifications/recharge-notification-consumer.js';
import { NotificationDeviceRegistry } from '../../modules/notifications/notification-device-registry.js';
import { PrismaNotificationDeviceRepository } from './notification-device-repository.js';
import type { NotificationTransport } from '../../modules/notifications/notification-transport.js';
import {
  createFcmNotificationDeviceSenderFromEnvironment,
  NotificationDeviceFanoutTransport,
} from '../../modules/notifications/notification-device-dispatcher.js';
import { PrismaNotificationRecipientResolver } from './notification-recipient-resolver.js';

type PrismaHopeHouseClient = PrismaClient & PrismaAuthRuntimeClient;

export interface PrismaHopeHouseServerOptions {
  readonly auth?: Omit<PrismaAuthRuntimeOptions, 'prisma'> & {
    readonly prisma?: CreatePrismaClientOptions<PrismaHopeHouseClient>;
  };
  readonly notificationTransport?: NotificationTransport;
  readonly notificationWorker?: {
    readonly enabled?: boolean;
    readonly intervalMs?: number;
    readonly workerId?: string;
  };
}

export interface PrismaHopeHouseServerComposition {
  readonly server: Server;
  readonly client: PrismaClient;
  readonly auditRepository: PostgresAuditLogRepository;
  readonly authRuntime: PrismaAuthRuntimeContext;
  readonly audit: AuditLogService;
  readonly catalogue: CatalogueService;
  readonly idempotency: PostgresIdempotencyStore;
  readonly notificationDevices: NotificationDeviceRegistry;
  readonly wallet: WalletApiService;
  readonly orderRepository: PrismaOrderRepository;
  readonly orderEngine: OrderEngine;
  readonly mobileMoneyRecharge: MobileMoneyRechargeUseCase;
  readonly receiptService: ReceiptService;
  processNotificationOutboxBatch(): Promise<number>;
  readonly notificationWorker: OutboxWorker | null;
  close(): Promise<void>;
}

type RequestServer = { emit(event: string, ...args: unknown[]): boolean };

function delegateToBaseServer(baseServer: Server, request: IncomingMessage, response: ServerResponse): void {
  (baseServer as unknown as RequestServer).emit('request', request, response);
}

export async function createPrismaHopeHouseServer(options: PrismaHopeHouseServerOptions = {}): Promise<PrismaHopeHouseServerComposition> {
  const authOptions = options.auth ?? {};
  const client = await createPrismaClient<PrismaHopeHouseClient>({
    ...(authOptions.prisma ?? {}),
    databaseUrl: authOptions.databaseUrl ?? authOptions.prisma?.databaseUrl,
  });
  const policy = await resolvePrismaAuthSecurityPolicy(client, authOptions.policy);
  const authRuntime = new PrismaAuthRuntimeContext(client, { ...authOptions, policy });
  const auditRepository = new PrismaAuditLogRepository(client);
  const audit = new AuditLogService(auditRepository);
  const catalogue = new CatalogueService(new PrismaCatalogRepository(client));
  const idempotency = new PostgresIdempotencyStore(client);
  const notificationDevices = new NotificationDeviceRegistry(new PrismaNotificationDeviceRepository(client));
  const walletRepository = new PrismaWalletRepository(client);
  const notificationRecipientResolver = new PrismaNotificationRecipientResolver(walletRepository);
  const creditWalletUseCase = new CreditWalletUseCase({
    prisma: client,
    walletRepository,
    idempotencyStore: idempotency,
    createIdempotencyStore: (tx: unknown) => new PostgresIdempotencyStore(tx as Prisma.TransactionClient),
    createOutboxStore: (tx: Prisma.TransactionClient) => new PostgresOutboxStore(tx),
  });
  const wallet = walletApiServiceFromUseCase(creditWalletUseCase);
  const mobileMoneyRecharge = new MobileMoneyRechargeUseCase(client, idempotency, creditWalletUseCase);
  const receiptService = new ReceiptService(new PrismaReceiptRepository(client));

  const notificationTransport = options.notificationTransport
    ?? (process.env.NOTIFICATION_TRANSPORT === 'fcm'
      ? new NotificationDeviceFanoutTransport(
          notificationDevices,
          [createFcmNotificationDeviceSenderFromEnvironment()],
        )
      : undefined);

  const notificationConsumer = notificationTransport === undefined
    ? null
    : new RechargeNotificationConsumer(notificationTransport, idempotency, notificationRecipientResolver);
  const notificationPublisher = notificationConsumer === null
    ? null
    : new OutboxNotificationPublisher(notificationConsumer);
  const notificationRelay = notificationPublisher === null
    ? null
    : new OutboxRelay(new PostgresOutboxStore(client), notificationPublisher, {
        workerId: options.notificationWorker?.workerId ?? 'notification-worker',
        batchSize: 50,
      });
  const notificationWorker = notificationRelay === null
    ? null
    : new OutboxWorker(notificationRelay, {
        intervalMs: options.notificationWorker?.intervalMs,
        onError: (error) => console.error('Notification outbox worker failed', error),
      });

  const orderRepository = new PrismaOrderRepository(client, auditRepository);
  const orderEngine = new OrderEngine({
    payment: async ({ order, actorId, tx }) => {
      if (tx === undefined) throw new Error('Transactional context required for payment transition');
      const transactionClient = tx as Prisma.TransactionClient;
      const monetaryIntent = order.monetaryIntent;
      if (monetaryIntent === null || monetaryIntent.amountCents === 0) return;

      const wallet = await transactionClient.wallet.findUnique({
        where: {
          wallets_owner_type_owner_id_unique: {
            ownerType: 'USER',
            ownerId: order.requester.id,
          },
        },
      });
      if (!wallet) throw new WalletNotFoundError('Wallet not found for requester ' + order.requester.id);

      const walletRepository = new PrismaWalletRepository(transactionClient as unknown as PrismaClient);
      await walletRepository.reserveWithinTransaction(transactionClient, {
        reservationId: randomUUID(),
        transactionId: randomUUID(),
        walletId: wallet.id,
        currency: monetaryIntent.currency,
        amountCents: monetaryIntent.amountCents,
        actorId,
        transactionKey: 'order:' + order.id + ':payment',
        relatedEntityType: 'order',
        relatedEntityId: order.id,
        metadata: { orderId: order.id, step: 'payment' },
      });

      const event: DomainEventEnvelope = {
        eventId: randomUUID(),
        eventType: 'order.payment_reserved',
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: order.id,
        causationId: null,
        aggregateId: order.id,
        aggregateType: 'order',
        payload: {
          orderId: order.id,
          walletId: wallet.id,
          amountCents: monetaryIntent.amountCents,
          currency: monetaryIntent.currency,
          actorId,
        },
      };
      await new PostgresOutboxStore(transactionClient).append(event);
    },
  }, orderRepository, {
    prisma: client,
    idempotencyStore: idempotency,
    createIdempotencyStore: (tx: unknown) => new PostgresIdempotencyStore(tx as Prisma.TransactionClient),
  });

  const baseServer = createHopeHouseServer({ authRuntime, audit, orderRepository, orderEngine, notificationDevices });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/catalogue/')) {
      void handleCatalogueHttp(authRuntime, catalogue, request, response).catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      });
      return;
    }
    if (pathname.includes('/recharges')) {
      void handleMobileMoneyRechargeHttp(authRuntime, mobileMoneyRecharge, request, response).catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      });
      return;
    }
    if (pathname.startsWith('/receipts/')) {
      void handleReceiptHttp(authRuntime, receiptService, request, response).catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      });
      return;
    }
    if (pathname.startsWith('/wallets/')) {
      void handleWalletHttp(authRuntime, wallet, request, response).catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      });
      return;
    }
    delegateToBaseServer(baseServer, request, response);
  });

  return Object.freeze({
    server,
    client,
    authRuntime,
    auditRepository,
    audit,
    catalogue,
    idempotency,
    notificationDevices,
    wallet,
    orderRepository,
    orderEngine,
    mobileMoneyRecharge,
    receiptService,
    notificationWorker,
    async processNotificationOutboxBatch(): Promise<number> {
      if (notificationRelay === null) return 0;
      return notificationRelay.processBatch();
    },
    async close(): Promise<void> {
      await notificationWorker?.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => baseServer.close(() => resolve()));
      await client.$disconnect();
    },
  });
}
