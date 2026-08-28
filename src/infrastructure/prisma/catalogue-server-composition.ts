/**
 * Backward-compatible catalogue composition entry point.
 *
 * The production composition lives in server-composition.ts so catalogue,
 * durable audit, idempotency, and authentication share one Prisma client.
 */
export {
  createPrismaHopeHouseServer as createPrismaCatalogueServer,
} from './server-composition.js';

export type {
  PrismaHopeHouseServerComposition as PrismaCatalogueServerComposition,
  PrismaHopeHouseServerOptions as PrismaCatalogueServerOptions,
} from './server-composition.js';
