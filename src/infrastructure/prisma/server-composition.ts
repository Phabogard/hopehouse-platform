import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { createHopeHouseServer } from '../../app.js';
import { AuditLogService } from '../../modules/audit/audit-log.js';
import { CatalogueService } from '../../modules/catalogue/catalogue-service.js';
import { handleCatalogueHttp } from '../../modules/catalogue/catalogue-http.js';
import { PrismaAuditLogRepository } from './audit-log-repository.js';
import { PrismaAuthRuntimeContext, resolvePrismaAuthSecurityPolicy, type PrismaAuthRuntimeClient, type PrismaAuthRuntimeOptions } from './auth-runtime.js';
import { PrismaCatalogRepository } from './catalogue-repository.js';
import { createPrismaClient, type CreatePrismaClientOptions } from './client.js';
import { PostgresIdempotencyStore } from './idempotency-store.js';

type PrismaHopeHouseClient = PrismaClient & PrismaAuthRuntimeClient;

export interface PrismaHopeHouseServerOptions {
  readonly auth?: Omit<PrismaAuthRuntimeOptions, 'prisma'> & {
    readonly prisma?: CreatePrismaClientOptions<PrismaHopeHouseClient>;
  };
}

export interface PrismaHopeHouseServerComposition {
  readonly server: Server;
  readonly authRuntime: PrismaAuthRuntimeContext;
  readonly audit: AuditLogService;
  readonly catalogue: CatalogueService;
  readonly idempotency: PostgresIdempotencyStore;
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
  const audit = new AuditLogService(new PrismaAuditLogRepository(client));
  const catalogue = new CatalogueService(new PrismaCatalogRepository(client));
  const idempotency = new PostgresIdempotencyStore(client);
  const baseServer = createHopeHouseServer({ authRuntime, audit });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/catalogue/')) {
      void handleCatalogueHttp(authRuntime, catalogue, request, response).catch((error: unknown) => {
        response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
      });
      return;
    }
    delegateToBaseServer(baseServer, request, response);
  });

  return Object.freeze({
    server,
    authRuntime,
    audit,
    catalogue,
    idempotency,
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => baseServer.close(() => resolve()));
      await client.$disconnect();
    },
  });
}
