export interface PrismaClientLifecycle {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
}

type PrismaClientOptions = {
  readonly datasources?: {
    readonly db?: {
      readonly url?: string;
    };
  };
};

type PrismaClientConstructor<TClient extends PrismaClientLifecycle = PrismaClientLifecycle> = new (options?: PrismaClientOptions) => TClient;

interface PrismaClientModule<TClient extends PrismaClientLifecycle = PrismaClientLifecycle> {
  readonly PrismaClient: PrismaClientConstructor<TClient>;
}

export type PrismaClientModuleLoader<TClient extends PrismaClientLifecycle = PrismaClientLifecycle> = () => Promise<PrismaClientModule<TClient>>;

export interface CreatePrismaClientOptions<TClient extends PrismaClientLifecycle = PrismaClientLifecycle> {
  readonly databaseUrl?: string;
  readonly loadModule?: PrismaClientModuleLoader<TClient>;
}

const dynamicImport = new Function('specifier', 'return import(specifier)') as <TModule>(specifier: string) => Promise<TModule>;

export function loadGeneratedPrismaClientModule<TClient extends PrismaClientLifecycle = PrismaClientLifecycle>(): Promise<PrismaClientModule<TClient>> {
  return dynamicImport<PrismaClientModule<TClient>>('@prisma/client');
}

export async function createPrismaClient<TClient extends PrismaClientLifecycle = PrismaClientLifecycle>(options: CreatePrismaClientOptions<TClient> = {}): Promise<TClient> {
  const { PrismaClient } = await (options.loadModule ?? loadGeneratedPrismaClientModule<TClient>)();
  return new PrismaClient(options.databaseUrl === undefined ? undefined : { datasources: { db: { url: options.databaseUrl } } });
}
