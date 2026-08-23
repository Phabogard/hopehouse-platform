import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import { createHopeHouseServer } from '../../app.js';
import { CatalogueService } from '../../modules/catalogue/catalogue-service.js';
import { handleCatalogueHttp } from '../../modules/catalogue/catalogue-http.js';
import type { AuthRuntimeOptions } from '../../modules/auth-security/auth-context.js';
import { PrismaAuthRuntimeContext, resolvePrismaAuthSecurityPolicy, type PrismaAuthRuntimeClient } from './auth-runtime.js';
import { PrismaCatalogRepository } from './catalogue-repository.js';
import { createPrismaClient } from './client.js';

export interface PrismaCatalogueServerOptions {
  readonly auth?: AuthRuntimeOptions & { readonly databaseUrl?: string };
}

export interface PrismaCatalogueServerComposition {
  readonly server: Server;
  readonly authRuntime: PrismaAuthRuntimeContext;
  close(): Promise<void>;
}

type RequestServer = { emit(event: string, ...args: unknown[]): boolean };

function delegateToBaseServer(baseServer: Server, request: IncomingMessage, response: ServerResponse): void {
  (baseServer as unknown as RequestServer).emit('request', request, response);
}

export async function createPrismaCatalogueServer(options: PrismaCatalogueServerOptions = {}): Promise<PrismaCatalogueServerComposition> {
  const authOptions = options.auth ?? {};
  const client = await createPrismaClient<PrismaClient & PrismaAuthRuntimeClient>({
    databaseUrl: authOptions.databaseUrl,
  });
  const policy = await resolvePrismaAuthSecurityPolicy(client, authOptions.policy);
  const authRuntime = new PrismaAuthRuntimeContext(client, { ...authOptions, policy });
  const catalogueService = new CatalogueService(new PrismaCatalogRepository(client));
  const baseServer = createHopeHouseServer({ authRuntime });
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/catalogue/')) {
      void handleCatalogueHttp(authRuntime, catalogueService, request, response).catch((error: unknown) => {
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
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => baseServer.close(() => resolve()));
      await client.$disconnect();
    },
  });
}
