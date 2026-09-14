import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PostgresIdempotencyStore } from '../src/infrastructure/prisma/idempotency-store.js';
import { PostgresOutboxStore } from '../src/infrastructure/outbox/postgres-outbox-store.js';
import { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';
import { CreditWalletUseCase } from '../src/modules/wallets/credit-wallet-use-case.js';
import type { WalletCreditedPayload } from '../src/modules/wallets/wallet-events.js';

function isTransactionKeyConflictError(err: unknown): boolean {
  return err instanceof Error && (err as { code?: unknown }).code === 'WALLET_CONFLICT';
}

const databaseUrl = process.env.DATABASE_URL;

function integrationClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl as string } } });
}

function buildUseCase(client: PrismaClient): CreditWalletUseCase {
  const walletRepository = new PrismaWalletRepository(client);
  return new CreditWalletUseCase({
    prisma: client,
    walletRepository,
    idempotencyStore: new PostgresIdempotencyStore(client),
    createIdempotencyStore: (tx) => new PostgresIdempotencyStore(tx as any),
    createOutboxStore: (tx) => new PostgresOutboxStore<WalletCreditedPayload>(tx as any),
  });
}

async function createTestWallet(client: PrismaClient, walletId: string): Promise<void> {
  await client.wallet.create({
    data: { id: walletId, ownerType: 'integration_test', ownerId: walletId },
  });
}

async function cleanup(client: PrismaClient, walletId: string, idempotencyKeys: readonly string[]): Promise<void> {
  await client.outboxMessage.deleteMany({ where: { aggregateId: walletId } });
  if (idempotencyKeys.length > 0) {
    await client.$executeRaw`DELETE FROM idempotency_records WHERE key = ANY(${idempotencyKeys})`;
  }
  await client.walletTransaction.deleteMany({ where: { walletId } });
  await client.walletBalance.deleteMany({ where: { walletId } });
  await client.wallet.deleteMany({ where: { id: walletId } });
}

test('wallet credit: persistance réelle du crédit, de la WalletTransaction, de l’IdempotencyRecord et de l’OutboxMessage', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKey = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const useCase = buildUseCase(client);

    const result = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 2_500,
      actorId: 'integration-actor',
      idempotencyKey,
    });

    assert.equal(result.replayed, false);

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.ok(balance !== null);
    assert.equal(balance.availableCents, 2_500n);

    const persistedTransaction = await client.walletTransaction.findUnique({ where: { id: result.transaction.id } });
    assert.ok(persistedTransaction !== null);
    assert.equal(persistedTransaction.amountCents, 2_500n);
    assert.equal(persistedTransaction.transactionKey, null, 'aucun transactionKey ne doit être dérivé de idempotencyKey');

    const idempotencyRecord = await client.$queryRaw<Array<{ key: string; result_reference: string | null }>>`
      SELECT key, result_reference FROM idempotency_records WHERE key = ${idempotencyKey} AND operation = 'wallet.credit'
    `;
    assert.equal(idempotencyRecord.length, 1);
    assert.equal(idempotencyRecord[0]?.result_reference, result.transaction.id);

    const outboxMessage = await client.outboxMessage.findFirst({ where: { aggregateId: walletId } });
    assert.ok(outboxMessage !== null);
    assert.equal(outboxMessage.eventType, 'wallet.credited');
    assert.deepEqual(outboxMessage.payloadJson, {
      walletId,
      transactionId: result.transaction.id,
      currency: 'USD',
      amountCents: 2_500,
      actorId: 'integration-actor',
      relatedEntityType: null,
      relatedEntityId: null,
    });
  } finally {
    await cleanup(client, walletId, [idempotencyKey]);
    await client.$disconnect();
  }
});

test('wallet credit: même Idempotency-Key → aucun double crédit ni double événement Outbox', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKey = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const useCase = buildUseCase(client);

    const first = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 1_000,
      actorId: 'integration-actor',
      idempotencyKey,
    });
    const second = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 1_000,
      actorId: 'integration-actor',
      idempotencyKey,
    });

    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.transaction.id, first.transaction.id);

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 1_000n, 'le solde ne doit refléter qu’un seul crédit');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 1, 'une seule WalletTransaction doit exister');

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: walletId } });
    assert.equal(outboxCount, 1, 'un seul OutboxMessage doit exister');
  } finally {
    await cleanup(client, walletId, [idempotencyKey]);
    await client.$disconnect();
  }
});

test('wallet credit: deux requêtes concurrentes avec la même Idempotency-Key → une seule opération effective', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKey = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const clientA = integrationClient();
    const clientB = integrationClient();
    const useCaseA = buildUseCase(clientA);
    const useCaseB = buildUseCase(clientB);

    const command = {
      walletId,
      currency: 'USD',
      amountCents: 750,
      actorId: 'integration-actor',
      idempotencyKey,
    };

    const [resultA, resultB] = await Promise.all([
      useCaseA.execute(command),
      useCaseB.execute(command),
    ]);

    assert.equal(resultA.transaction.id, resultB.transaction.id, 'les deux appels concurrents doivent renvoyer la même transaction');
    assert.deepEqual(resultA.transaction, resultB.transaction, 'le résultat renvoyé doit être identique aux deux appelants');
    assert.equal([resultA.replayed, resultB.replayed].filter((v) => v === false).length, 1, 'exactement un des deux appels doit avoir exécuté le crédit');

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 750n, 'le solde ne doit refléter qu’un seul crédit malgré la concurrence');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 1);

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: walletId } });
    assert.equal(outboxCount, 1);

    const idempotencyRows = await client.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM idempotency_records WHERE key = ${idempotencyKey} AND operation = 'wallet.credit'
    `;
    assert.equal(idempotencyRows.length, 1, 'exactement un IdempotencyRecord doit exister malgré la concurrence');

    await clientA.$disconnect();
    await clientB.$disconnect();
  } finally {
    await cleanup(client, walletId, [idempotencyKey]);
    await client.$disconnect();
  }
});

test('wallet credit: rollback complet si l’écriture Outbox échoue dans la transaction', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKey = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const walletRepository = new PrismaWalletRepository(client);
    const useCase = new CreditWalletUseCase({
      prisma: client,
      walletRepository,
      idempotencyStore: new PostgresIdempotencyStore(client),
      createIdempotencyStore: (tx) => new PostgresIdempotencyStore(tx as any),
      createOutboxStore: () => ({
        append: async () => {
          throw new Error('simulated outbox failure inside the transaction');
        },
        claimBatch: async () => [],
        markPublished: async () => {},
        markFailed: async () => {},
      }),
    });

    await assert.rejects(() =>
      useCase.execute({
        walletId,
        currency: 'USD',
        amountCents: 400,
        actorId: 'integration-actor',
        idempotencyKey,
      }),
    );

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance, null, 'aucune balance ne doit avoir été créée: la transaction entière a dû être annulée');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 0, 'aucune WalletTransaction ne doit persister après un rollback');

    const idempotencyRecord = await client.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM idempotency_records WHERE key = ${idempotencyKey} AND operation = 'wallet.credit'
    `;
    assert.equal(idempotencyRecord.length, 0, 'aucun IdempotencyRecord ne doit persister après un rollback');
  } finally {
    await cleanup(client, walletId, [idempotencyKey]);
    await client.$disconnect();
  }
});

// --- A. Collision séquentielle : idempotencyKey différentes, même transactionKey ---
test('wallet credit: collision transactionKey séquentielle → TransactionKeyConflictError, aucun résidu', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKeyA = randomUUID();
  const idempotencyKeyB = randomUUID();
  const transactionKey = 'momo:shared-ref';

  try {
    await createTestWallet(client, walletId);
    const useCase = buildUseCase(client);

    const resultA = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 1_000,
      actorId: 'actor-a',
      idempotencyKey: idempotencyKeyA,
      transactionKey,
    });
    assert.equal(resultA.replayed, false);

    await assert.rejects(
      () =>
        useCase.execute({
          walletId,
          currency: 'USD',
          amountCents: 1_000,
          actorId: 'actor-b',
          idempotencyKey: idempotencyKeyB,
          transactionKey, // même référence métier, idempotencyKey différente
        }),
      isTransactionKeyConflictError,
    );

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 1_000n, 'le solde ne doit refléter que le crédit de A');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 1, 'une seule WalletTransaction doit exister');

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: walletId } });
    assert.equal(outboxCount, 1, 'un seul OutboxMessage doit exister');

    const idempotencyRows = await client.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM idempotency_records WHERE operation = 'wallet.credit' AND key = ANY(${[idempotencyKeyA, idempotencyKeyB]})
    `;
    assert.equal(idempotencyRows.length, 1, 'seule la tentative gagnante (A) doit avoir un IdempotencyRecord durable');
    assert.equal(idempotencyRows[0]?.key, idempotencyKeyA);
  } finally {
    await cleanup(client, walletId, [idempotencyKeyA, idempotencyKeyB]);
    await client.$disconnect();
  }
});

// --- B. Collision concurrente réelle : idempotencyKey différentes, même transactionKey, simultané ---
test('wallet credit: collision transactionKey concurrente réelle → exactement un succès et un TransactionKeyConflictError', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKeyA = randomUUID();
  const idempotencyKeyB = randomUUID();
  const transactionKey = 'momo:concurrent-ref';

  try {
    await createTestWallet(client, walletId);
    const clientA = integrationClient();
    const clientB = integrationClient();
    const useCaseA = buildUseCase(clientA);
    const useCaseB = buildUseCase(clientB);

    const [settledA, settledB] = await Promise.allSettled([
      useCaseA.execute({
        walletId,
        currency: 'USD',
        amountCents: 900,
        actorId: 'actor-a',
        idempotencyKey: idempotencyKeyA,
        transactionKey,
      }),
      useCaseB.execute({
        walletId,
        currency: 'USD',
        amountCents: 900,
        actorId: 'actor-b',
        idempotencyKey: idempotencyKeyB,
        transactionKey,
      }),
    ]);

    const outcomes = [settledA, settledB];
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'exactement un des deux appels doit réussir');
    assert.equal(rejected.length, 1, 'exactement un des deux appels doit échouer');
    assert.equal(
      isTransactionKeyConflictError((rejected[0] as PromiseRejectedResult).reason),
      true,
      "l'échec doit être un TransactionKeyConflictError (code WALLET_CONFLICT), pas une autre erreur",
    );

    const winningResult = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof useCaseA.execute>>>).value;
    assert.equal(winningResult.replayed, false);

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 900n, 'le résultat ne doit pas dépendre du timing : un seul crédit doit être appliqué');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 1);

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: walletId } });
    assert.equal(outboxCount, 1);

    const idempotencyRows = await client.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM idempotency_records WHERE operation = 'wallet.credit' AND key = ANY(${[idempotencyKeyA, idempotencyKeyB]})
    `;
    assert.equal(idempotencyRows.length, 1, 'exactement un IdempotencyRecord doit exister, quel que soit le timing');

    await clientA.$disconnect();
    await clientB.$disconnect();
  } finally {
    await cleanup(client, walletId, [idempotencyKeyA, idempotencyKeyB]);
    await client.$disconnect();
  }
});

// --- C. Retry après conflit : même idempotencyKey, transactionKey différent ---
test('wallet credit: retry après TransactionKeyConflictError avec un transactionKey différent réussit', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKeyA = randomUUID();
  const idempotencyKeyB = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const useCase = buildUseCase(client);

    await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 500,
      actorId: 'actor-a',
      idempotencyKey: idempotencyKeyA,
      transactionKey: 'momo:ref-1',
    });

    await assert.rejects(
      () =>
        useCase.execute({
          walletId,
          currency: 'USD',
          amountCents: 300,
          actorId: 'actor-b',
          idempotencyKey: idempotencyKeyB,
          transactionKey: 'momo:ref-1', // collision volontaire
        }),
      isTransactionKeyConflictError,
    );

    // Même Idempotency-Key B, mais transactionKey différent cette fois: doit réussir.
    const retryResult = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 300,
      actorId: 'actor-b',
      idempotencyKey: idempotencyKeyB,
      transactionKey: 'momo:ref-2',
    });

    assert.equal(retryResult.replayed, false);
    assert.equal(retryResult.transaction.transactionKey, 'momo:ref-2');

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 800n, 'les deux crédits réussis (A et le retry de B) doivent être appliqués');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 2);
  } finally {
    await cleanup(client, walletId, [idempotencyKeyA, idempotencyKeyB]);
    await client.$disconnect();
  }
});

// --- E. transactionKey absent pour les deux : commandes indépendantes, jamais de collision ---
test('wallet credit: transactionKey absent pour deux Idempotency-Key différentes → deux mouvements indépendants', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKeyA = randomUUID();
  const idempotencyKeyB = randomUUID();

  try {
    await createTestWallet(client, walletId);
    const useCase = buildUseCase(client);

    const resultA = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 200,
      actorId: 'actor-a',
      idempotencyKey: idempotencyKeyA,
      // pas de transactionKey
    });
    const resultB = await useCase.execute({
      walletId,
      currency: 'USD',
      amountCents: 200,
      actorId: 'actor-b',
      idempotencyKey: idempotencyKeyB,
      // pas de transactionKey non plus : la contrainte SQL (WHERE transaction_key
      // IS NOT NULL) ne doit jamais traiter deux NULL comme identiques.
    });

    assert.notEqual(resultA.transaction.id, resultB.transaction.id);
    assert.equal(resultA.transaction.transactionKey, null);
    assert.equal(resultB.transaction.transactionKey, null);

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(balance?.availableCents, 400n, 'les deux crédits doivent être appliqués indépendamment');

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 2);
  } finally {
    await cleanup(client, walletId, [idempotencyKeyA, idempotencyKeyB]);
    await client.$disconnect();
  }
});

// --- 9. Concurrence réelle, deux crédits INDÉPENDANTS (pas de collision) ---
// Distinct des tests de concurrence déjà présents : ceux-ci vérifient qu'une
// SEULE requête aboutit (rejeu Idempotency-Key identique, ou collision
// transactionKey). Ici, les deux requêtes sont légitimes et doivent TOUTES
// LES DEUX aboutir : l'invariant testé est l'absence de lost update sur
// `wallet_balances.available_cents` (incrément atomique Prisma
// `{ increment }`, qui compile en `UPDATE ... SET available_cents =
// available_cents + X`).
//
// Robustesse : Promise.all() garantit un entrelacement applicatif (Node.js),
// mais PAS que les deux transactions PostgreSQL se chevauchent réellement
// côté serveur. Pour le garantir, ce test :
//   1. pré-crée la ligne wallet_balances (isole l'invariant "increment" de
//      la course d'insertion de l'upsert, un chemin différent) ;
//   2. verrouille explicitement cette ligne (SELECT ... FOR UPDATE) depuis
//      une troisième connexion dédiée, maintenue ouverte via une transaction
//      interactive Prisma, et capture le pid PostgreSQL réel de cette
//      connexion (pg_backend_pid(), lu DANS la même transaction pour
//      garantir qu'il s'agit bien de la connexion physique qui détient le
//      verrou) ;
//   3. lance les deux crédits, qui vont nécessairement se bloquer en tentant
//      de verrouiller/mettre à jour cette même ligne ;
//   4. interroge pg_blocking_pids(pid) — la fonction PostgreSQL 16 dédiée à
//      la résolution des chaînes de blocage réelles, indépendamment du type
//      de verrou interne (transactionid, tuple, etc.) — jusqu'à observer
//      réellement 2 backends bloqués PAR le pid détenteur du verrou.
//
//      Note technique : un simple SELECT sur pg_locks (relation, granted)
//      NE PEUT PAS servir de preuve ici. Le verrou relationnel pris par un
//      UPDATE/SELECT FOR UPDATE (RowExclusiveLock / RowShareLock) est
//      compatible avec lui-même et s'obtient immédiatement (granted=true) ;
//      l'attente réelle entre deux transactions sur la même ligne se
//      matérialise via un verrou de type transactionid (attente de fin de
//      la transaction détentrice), dont la colonne relation est NULL — donc
//      invisible à toute requête qui joint pg_locks sur pg_class. Utiliser
//      pg_blocking_pids() évite cette hypothèse fragile en interrogeant
//      directement la relation de blocage résolue par PostgreSQL lui-même.
//   5. libère alors le verrou seulement après avoir observé le blocage réel
//      (ou après expiration du délai, avec échec explicite), laissant
//      PostgreSQL sérialiser les deux UPDATE en conflit, puis attend
//      systématiquement l'issue des deux crédits — même si l'observation a
//      échoué — avant toute assertion et avant toute déconnexion.
//
// Aucune modification du code de production : le verrou exploité est celui
// que Prisma/PostgreSQL prennent déjà naturellement sur un UPDATE de ligne ;
// ce test ne fait qu'observer, depuis l'extérieur, la contention réelle.
test('wallet credit: deux crédits indépendants concurrents (idempotencyKey et transactionKey distincts) → aucun lost update sur le solde, contention PostgreSQL réelle confirmée via pg_blocking_pids', { skip: databaseUrl === undefined }, async () => {
  const client = integrationClient();
  const lockClient = integrationClient();
  const walletId = `wallet-credit-${randomUUID()}`;
  const idempotencyKeyA = randomUUID();
  const idempotencyKeyB = randomUUID();
  let clientA: PrismaClient | undefined;
  let clientB: PrismaClient | undefined;
  let creditsPromise: Promise<[any, any]> | undefined;
  let lockTxPromise: Promise<unknown> | undefined;
  let releaseLock: (() => void) | undefined;

  try {
    await createTestWallet(client, walletId);

    // Pré-création de la ligne de solde : les deux crédits concurrents
    // exerceront donc la branche update/increment de l'upsert, jamais sa
    // branche create — isolant précisément l'invariant visé.
    await client.walletBalance.create({
      data: { walletId, currency: 'USD', availableCents: 0n, reservedCents: 0n },
    });

    let resolveLockAcquired!: (pid: number) => void;
    const lockAcquired = new Promise<number>((resolve) => {
      resolveLockAcquired = resolve;
    });
    let lockReleased = false;
    let releaseLockFn!: () => void;
    const releaseLockRequested = new Promise<void>((resolve) => {
      releaseLockFn = resolve;
    });
    releaseLock = () => {
      if (!lockReleased) {
        lockReleased = true;
        releaseLockFn();
      }
    };

    // Verrou explicite tenu par une transaction interactive dédiée, séparée
    // des deux connexions qui exécuteront les crédits. Le pid est capturé
    // DANS cette même transaction pour garantir qu'il correspond bien à la
    // connexion physique qui détient réellement le verrou de ligne.
    lockTxPromise = lockClient.$transaction(
      async (ltx) => {
        const pidRows = await ltx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        const pid = pidRows[0]!.pid;
        await ltx.$queryRaw`
          SELECT wallet_id FROM wallet_balances WHERE wallet_id = ${walletId} AND currency = 'USD' FOR UPDATE
        `;
        resolveLockAcquired(pid);
        await releaseLockRequested;
      },
      { timeout: 15_000, maxWait: 15_000 },
    );

    const lockHolderPid = await lockAcquired; // le verrou est confirmé pris avant de continuer

    clientA = integrationClient();
    clientB = integrationClient();
    const useCaseA = buildUseCase(clientA);
    const useCaseB = buildUseCase(clientB);

    const amountA = 1_234;
    const amountB = 5_678;

    // Lancés mais volontairement non attendus ici : les deux vont se
    // bloquer en tentant de verrouiller/mettre à jour la ligne détenue.
    creditsPromise = Promise.all([
      useCaseA.execute({
        walletId,
        currency: 'USD',
        amountCents: amountA,
        actorId: 'actor-a',
        idempotencyKey: idempotencyKeyA,
        transactionKey: 'order:independent-a',
      }),
      useCaseB.execute({
        walletId,
        currency: 'USD',
        amountCents: amountB,
        actorId: 'actor-b',
        idempotencyKey: idempotencyKeyB,
        transactionKey: 'order:independent-b',
      }),
    ]);

    // Confirmation active, bornée dans le temps, de la contention réelle :
    // interroge pg_blocking_pids() jusqu'à voir 2 backends bloqués PAR le
    // pid détenteur du verrou. Aucune supposition sur le type de verrou
    // interne — c'est PostgreSQL qui résout lui-même la chaîne de blocage.
    // Confirmation active, bornée dans le temps, de la contention réelle :
    // interroge pg_blocking_pids() via une CTE récursive pour reconstruire
    // la chaîne de blocage transitive dont la racine est lockHolderPid.
    // Les deux crédits peuvent se bloquer soit directement par lockHolderPid
    // (arborescence directe), soit l'un par lockHolderPid et le second par
    // le premier crédit (chaîne séquentielle).
    const pollDeadline = Date.now() + 2_500;
    let observedBlockedCount = 0;
    while (Date.now() < pollDeadline) {
      const rows = await client.$queryRaw<Array<{ n: bigint }>>`
        WITH RECURSIVE blocked_chain AS (
          SELECT pid
          FROM pg_stat_activity
          WHERE pid <> pg_backend_pid()
            AND ${lockHolderPid} = ANY(pg_blocking_pids(pid))
          UNION
          SELECT sa.pid
          FROM pg_stat_activity sa
          JOIN blocked_chain bc ON bc.pid = ANY(pg_blocking_pids(sa.pid))
          WHERE sa.pid <> pg_backend_pid()
        )
        SELECT count(DISTINCT pid)::bigint AS n FROM blocked_chain
      `;
      observedBlockedCount = Number(rows[0]?.n ?? 0n);
      if (observedBlockedCount >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Le verrou est relâché dans tous les cas (même si l'observation a
    // échoué) pour ne jamais laisser une transaction bloquée en suspens.
    releaseLock();
    await lockTxPromise;

    // creditsPromise est TOUJOURS attendue ici, avant toute assertion et
    // avant toute déconnexion — y compris si l'observation ci-dessus a
    // échoué à atteindre 2. Ceci garantit qu'aucune promesse en vol n'est
    // abandonnée, quelle que soit l'issue du test.
    const [resultA, resultB] = await creditsPromise;

    assert.equal(
      observedBlockedCount >= 2,
      true,
      `contention PostgreSQL jamais observée via pg_blocking_pids (max constaté: ${observedBlockedCount} backends bloqués par le détenteur du verrou) — le test ne peut pas garantir une vraie concurrence`,
    );

    // Les deux doivent avoir réellement crédité — ni rejeu, ni conflit.
    assert.equal(resultA.replayed, false);
    assert.equal(resultB.replayed, false);
    assert.notEqual(resultA.transaction.id, resultB.transaction.id);

    const balance = await client.walletBalance.findUnique({
      where: { walletId_currency: { walletId, currency: 'USD' } },
    });
    assert.equal(
      balance?.availableCents,
      BigInt(amountA + amountB),
      'le solde doit être exactement la somme des deux crédits concurrents — un lost update donnerait un solde inférieur',
    );

    const transactionCount = await client.walletTransaction.count({ where: { walletId } });
    assert.equal(transactionCount, 2, 'les deux WalletTransaction doivent exister');

    const outboxCount = await client.outboxMessage.count({ where: { aggregateId: walletId } });
    assert.equal(outboxCount, 2, 'les deux OutboxMessage doivent exister');

    const idempotencyRows = await client.$queryRaw<Array<{ key: string }>>`
      SELECT key FROM idempotency_records WHERE operation = 'wallet.credit' AND key = ANY(${[idempotencyKeyA, idempotencyKeyB]})
    `;
    assert.equal(idempotencyRows.length, 2, 'chaque tentative réussie doit avoir son propre IdempotencyRecord');
  } finally {
    if (releaseLock) {
      releaseLock();
    }
    if (lockTxPromise) {
      await lockTxPromise.catch(() => {});
    }
    if (creditsPromise) {
      await creditsPromise.catch(() => {});
    }
    if (clientA) await clientA.$disconnect();
    if (clientB) await clientB.$disconnect();
    await cleanup(client, walletId, [idempotencyKeyA, idempotencyKeyB]);
    await client.$disconnect();
    await lockClient.$disconnect();
  }
});
