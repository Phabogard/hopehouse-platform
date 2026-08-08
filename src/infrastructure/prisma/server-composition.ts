import type { Server } from 'node:http';
import { createHopeHouseServer } from '../../app.js';
import { PrismaAuthRuntimeContext, type PrismaAuthRuntimeClient, type PrismaAuthRuntimeOptions } from './auth-runtime.js';
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
  const authRuntime = new PrismaAuthRuntimeContext(client, authOptions);
  const server = createHopeHouseServer({ authRuntime });

  return Object.freeze({
    server,
    authRuntime,
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(resolve));
      await client.$disconnect();
    },
  });
}
