import { InMemoryNotificationTransport } from './modules/notifications/notification-transport.js';
import { createPrismaHopeHouseServer } from './infrastructure/prisma/server-composition.js';

const port = Number(process.env.PORT ?? 3000);
const notificationTransport = process.env.NOTIFICATION_TRANSPORT === 'in-memory'
  ? new InMemoryNotificationTransport()
  : undefined;
const notificationWorkerEnabled = process.env.NOTIFICATION_WORKER_ENABLED === 'true';
const configuredIntervalMs = Number(process.env.OUTBOX_WORKER_INTERVAL_MS ?? 1_000);
const notificationWorkerIntervalMs = Number.isInteger(configuredIntervalMs) && configuredIntervalMs > 0
  ? Math.min(configuredIntervalMs, 60_000)
  : 1_000;
const notificationWorkerId = process.env.OUTBOX_WORKER_ID ?? `notification-worker:${process.pid}`;

let shuttingDown = false;

void createPrismaHopeHouseServer({
  notificationTransport,
  notificationWorker: {
    enabled: notificationWorkerEnabled,
    intervalMs: notificationWorkerIntervalMs,
    workerId: notificationWorkerId,
  },
})
  .then(({ server, notificationWorker, close }) => {
    if (notificationWorkerEnabled && notificationWorker === null) {
      console.warn(
        'Notification outbox worker is enabled but no notification transport is configured; worker remains inactive.',
      );
    }

    server.listen(port, () => {
      console.log(`Hope House ERP API listening on http://localhost:${port}`);
      if (notificationWorkerEnabled && notificationWorker !== null) {
        notificationWorker.start();
        console.log(
          `Notification outbox worker started (interval=${notificationWorkerIntervalMs}ms, id=${notificationWorkerId})`,
        );
      }
    });

    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`Received ${signal}; shutting down Hope House ERP API`);
      await close();
    };

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  })
  .catch((error: unknown) => {
    console.error('Unable to start Hope House ERP API', error);
    process.exitCode = 1;
  });
