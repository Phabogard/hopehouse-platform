import { createServer, type Server } from 'node:http';
import { createHopeHouseServer } from '../../app.js';
import { AuditLogService } from '../../modules/audit/audit-log.js';
import { CatalogueService } from '../../modules/catalogue/catalogue-service.js';
import { handleCatalogueHttp } from '../../modules/catalogue/catalogue-http.js';
import { PrismaAuditLogRepository } from './audit-log-repository.js';
import { PrismaAuthRuntimeContext, resolvePrismaAuthSecurityPolicy, type PrismaAuthRuntimeClient, type PrismaAuthRuntimeOptions } from './auth-runtime.js';
import { PrismaCatalogRepository } from './catalogue-repository.js';
import { createPrismaClient } from './client.js';

export interface PrismaHopeHouseServerOptions {
  readonly auth?: PrismaAuthRuntimeOptions;
}

export interface PrismaHopeHouseServerComposition {
  readonly server: Server;
  readonly authRuntime: PrismaAuthRuntimeContext;
  close(): Promise<void>;
}

export async function createPrismaHopeHouseServer(options: PrismaHopeHouseServerOptions = {}): Promise<PrismaHopeHouseServerComposition> {
  const authOptions = options.auth ?? {};
  const client = await createPrismaClient<PrismaAuthRuntimeClient>({
    ...(authOptions.prisma ?? {}),
    databaseUrl: authOptions.databaseUrl ?? authOptions.prisma?.databaseUrl,
  });
  const policy = await resolvePrismaAuthSecurityPolicy(client, authOptions.policy);
  const authRuntime = new PrismaAuthRuntimeContext(client, { ...authOptions, policy });
  const audit = new AuditLogService(new PrismaAuditLogRepository(client));
  const catalogueService = new CatalogueService(new PrismaCatalogRepository(client));
  const baseServer = createHopeHouseServer({ authRuntime, audit });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/catalogue/')) {
      void handleCatalogueHttp(authRuntime, catalogueService, request, response).catch((error: unknown) => {
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal Server Error' }));
        } else {
          response.destroy(error instanceof Error ? error : undefined);
        }
      });
      return;
    }
    baseServer.emit('request', request, response);
  });

  return Object.freeze({
    server,
    authRuntime,
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => baseServer.close(() => resolve()));
      await client.$disconnect();
    },
  });
}
