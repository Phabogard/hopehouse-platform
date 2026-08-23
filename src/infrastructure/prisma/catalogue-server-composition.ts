import { createServer, type Server } from 'node:http';
import { createHopeHouseServer, type HopeHouseServerOptions } from '../../app.js';
import { CatalogueService } from '../../modules/catalogue/catalogue-service.js';
import { handleCatalogueHttp } from '../../modules/catalogue/catalogue-http.js';
import { PrismaCatalogRepository } from './catalogue-repository.js';
import { createPrismaClient } from './client.js';
import type { PrismaAuthRuntimeClient } from './auth-runtime.js';

export interface PrismaCatalogueServerOptions extends HopeHouseServerOptions {
  readonly databaseUrl?: string;
}

export interface PrismaCatalogueServerComposition {
  readonly server: Server;
  close(): Promise<void>;
}

export async function createPrismaCatalogueServer(options: PrismaCatalogueServerOptions = {}): Promise<PrismaCatalogueServerComposition> {
  const client = await createPrismaClient<PrismaAuthRuntimeClient>({ databaseUrl: options.databaseUrl });
  const catalogueService = new CatalogueService(new PrismaCatalogRepository(client));
  const baseServer = createHopeHouseServer(options);
  const authRuntime = options.authRuntime;

  if (authRuntime === null || authRuntime === undefined) {
    await client.$disconnect();
    throw new Error('A configured authRuntime is required for the Prisma Catalogue server.');
  }

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
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => baseServer.close(() => resolve()));
      await client.$disconnect();
    },
  });
}
