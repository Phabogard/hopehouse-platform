import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ValidationError } from '../src/core/errors.js';
import type { IdempotencyRecord, IdempotencyStore } from '../src/core/idempotency/idempotency.js';
import type { DomainEventEnvelope } from '../src/core/events/domain-event.js';
import type { OutboxStore } from '../src/core/outbox/outbox.js';
import {
  CreditWalletUseCase,
  type CreditWalletDependencies,
} from '../src/modules/wallets/credit-wallet-use-case.js';
import type { WalletCreditedPayload } from '../src/modules/wallets/wallet-events.js';
import type {
  CreditWalletParams,
  WalletTransactionDto,
} from '../src/modules/wallets/prisma-wallet-repository.js';

// Checked by `code` (not by importing the class as a runtime value) so this
// file stays a pure unit test with no runtime dependency on @prisma/client.
function isTransactionKeyConflictError(err: unknown): boolean {
  return err instanceof Error && (err as { code?: unknown }).code === 'WALLET_CONFLICT';
}

// Lightweight, purpose-built fakes. Real atomicity and concurrency
// guarantees (the actual point of this feature) are validated against real
// PostgreSQL in tests/wallet-credit-postgres.integration.test.ts — these
// unit tests only cover the use case's own orchestration logic.

class FakeIdempotencyStore implements IdempotencyStore {
  constructor(private readonly records: Map<string, IdempotencyRecord>) {}

  async find(key: string, operation: string): Promise<IdempotencyRecord | null> {
    return this.records.get(`${key}:${operation}`) ?? null;
  }

  async save(record: IdempotencyRecord): Promise<boolean> {
    const mapKey = `${record.key}:${record.operation}`;
    if (this.records.has(mapKey)) return false;
    this.records.set(mapKey, record);
    return true;
  }
}

class FakeOutboxStore implements OutboxStore<WalletCreditedPayload> {
  constructor(private readonly appended: DomainEventEnvelope<WalletCreditedPayload>[]) {}

  async append(event: DomainEventEnvelope<WalletCreditedPayload>): Promise<void> {
    this.appended.push(event);
  }

  claimBatch(): never {
    throw new Error('Not used in these unit tests');
  }

  markPublished(): never {
    throw new Error('Not used in these unit tests');
  }

  markFailed(): never {
    throw new Error('Not used in these unit tests');
  }
}

interface Harness {
  readonly useCase: CreditWalletUseCase;
  readonly outboxEvents: DomainEventEnvelope<WalletCreditedPayload>[];
  readonly creditCalls: CreditWalletParams[];
  readonly transactions: Map<string, WalletTransactionDto>;
  readonly idempotencyRecords: Map<string, IdempotencyRecord>;
}

function buildHarness(options: { failCreditOnce?: boolean } = {}): Harness {
  const idempotencyRecords = new Map<string, IdempotencyRecord>();
  const outboxEvents: DomainEventEnvelope<WalletCreditedPayload>[] = [];
  const transactions = new Map<string, WalletTransactionDto>();
  const transactionKeysByWallet = new Map<string, string>(); // `${walletId}:${transactionKey}` -> transactionId
  const creditCalls: CreditWalletParams[] = [];
  let creditAttempts = 0;

  const walletRepository = {
    async creditWithinTransaction(_tx: unknown, params: CreditWalletParams): Promise<WalletTransactionDto> {
      creditCalls.push(params);
      creditAttempts += 1;

      if (options.failCreditOnce && creditAttempts === 1) {
        throw new Error('simulated infrastructure failure');
      }

      if (params.transactionKey) {
        const conflictKey = `${params.walletId}:${params.transactionKey}`;
        const existingId = transactionKeysByWallet.get(conflictKey);
        if (existingId) {
          const existing = transactions.get(existingId);
          if (existing) return existing;
        }
      }

      const dto: WalletTransactionDto = Object.freeze({
        id: params.transactionId,
        walletId: params.walletId,
        currency: params.currency,
        amountCents: params.amountCents,
        type: 'CREDIT' as any,
        status: 'SETTLED' as any,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        relatedEntityType: params.relatedEntityType ?? null,
        relatedEntityId: params.relatedEntityId ?? null,
        reversalOfTransactionId: null,
        occurredAt: new Date().toISOString(),
        metadata: Object.freeze(params.metadata ?? {}),
      });

      transactions.set(dto.id, dto);
      if (params.transactionKey) {
        transactionKeysByWallet.set(`${params.walletId}:${params.transactionKey}`, dto.id);
      }
      return dto;
    },

    async getTransactionById(id: string): Promise<WalletTransactionDto | null> {
      return transactions.get(id) ?? null;
    },

    async findTransactionByKey(walletId: string, transactionKey: string): Promise<WalletTransactionDto | null> {
      const id = transactionKeysByWallet.get(`${walletId}:${transactionKey}`);
      return id ? transactions.get(id) ?? null : null;
    },
  };

  const rootIdempotencyStore = new FakeIdempotencyStore(idempotencyRecords);

  const deps: CreditWalletDependencies = {
    prisma: {
      // Simulates real PostgreSQL rollback semantics: snapshots the
      // in-memory state before running the callback and restores it if the
      // callback throws, so this fake actually verifies "nothing partial
      // persists on failure" instead of merely asserting it by fiat. Real
      // atomicity against a real database is verified separately in
      // tests/wallet-credit-postgres.integration.test.ts.
      async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        const idempotencySnapshot = new Map(idempotencyRecords);
        const transactionsSnapshot = new Map(transactions);
        const transactionKeysSnapshot = new Map(transactionKeysByWallet);
        try {
          return await fn({});
        } catch (err) {
          idempotencyRecords.clear();
          for (const [k, v] of idempotencySnapshot) idempotencyRecords.set(k, v);
          transactions.clear();
          for (const [k, v] of transactionsSnapshot) transactions.set(k, v);
          transactionKeysByWallet.clear();
          for (const [k, v] of transactionKeysSnapshot) transactionKeysByWallet.set(k, v);
          throw err;
        }
      },
    },
    walletRepository: walletRepository as any,
    idempotencyStore: rootIdempotencyStore,
    createIdempotencyStore: () => new FakeIdempotencyStore(idempotencyRecords),
    createOutboxStore: () => new FakeOutboxStore(outboxEvents),
  };

  return {
    useCase: new CreditWalletUseCase(deps),
    outboxEvents,
    creditCalls,
    transactions,
    idempotencyRecords,
  };
}

test('credit normal: crédite le wallet et retourne le résultat', async () => {
  const harness = buildHarness();

  const result = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
  });

  assert.equal(result.replayed, false);
  assert.equal(result.transaction.walletId, 'wallet-1');
  assert.equal(result.transaction.amountCents, 1_000);
  assert.equal(result.transaction.currency, 'USD');
  assert.equal(harness.creditCalls.length, 1);
});

test('événement WalletCredited conforme au contrat DomainEventEnvelope', async () => {
  const harness = buildHarness();

  const result = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
  });

  assert.equal(harness.outboxEvents.length, 1);
  const event = harness.outboxEvents[0];
  assert.equal(event?.eventType, 'wallet.credited');
  assert.equal(event?.aggregateId, 'wallet-1');
  assert.equal(event?.aggregateType, 'Wallet');
  assert.equal((event?.payload as WalletCreditedPayload).transactionId, result.transaction.id);
});

test('idempotence: un deuxième appel avec la même Idempotency-Key ne recrédite pas', async () => {
  const harness = buildHarness();
  const idempotencyKey = randomUUID();

  const first = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey,
  });

  const second = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey,
  });

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal(harness.creditCalls.length, 1, 'le crédit ne doit être exécuté qu’une seule fois');
  assert.equal(harness.outboxEvents.length, 1, 'un seul événement Outbox doit être créé');
});

test('deux appels concurrents (Promise.all) avec la même Idempotency-Key: une seule opération effective', async () => {
  const harness = buildHarness();
  const idempotencyKey = randomUUID();
  const command = {
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey,
  };

  const [a, b] = await Promise.all([harness.useCase.execute(command), harness.useCase.execute(command)]);

  assert.equal(a.transaction.id, b.transaction.id);
  assert.equal([a.replayed, b.replayed].filter((v) => v === false).length, 1);
  assert.equal(harness.creditCalls.length, 1);
  assert.equal(harness.outboxEvents.length, 1);
});

test('une Idempotency-Key différente déclenche un nouveau crédit distinct', async () => {
  const harness = buildHarness();

  const first = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
  });

  const second = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 500,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
  });

  assert.notEqual(first.transaction.id, second.transaction.id);
  assert.equal(harness.creditCalls.length, 2);
  assert.equal(harness.outboxEvents.length, 2);
});

test('validation: rejette un montant négatif', async () => {
  const harness = buildHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: -100,
        actorId: 'actor-1',
        idempotencyKey: randomUUID(),
      }),
    ValidationError,
  );
  assert.equal(harness.creditCalls.length, 0);
});

test('validation: rejette un montant nul', async () => {
  const harness = buildHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: 0,
        actorId: 'actor-1',
        idempotencyKey: randomUUID(),
      }),
    ValidationError,
  );
});

test('validation: rejette un montant non entier', async () => {
  const harness = buildHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: 10.5,
        actorId: 'actor-1',
        idempotencyKey: randomUUID(),
      }),
    ValidationError,
  );
});

test('validation: rejette une Idempotency-Key vide', async () => {
  const harness = buildHarness();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: 1_000,
        actorId: 'actor-1',
        idempotencyKey: '  ',
      }),
    ValidationError,
  );
  assert.equal(harness.creditCalls.length, 0);
});

test('erreur métier: une erreur du repository pendant le crédit se propage sans écrire Idempotency ni Outbox', async () => {
  const harness = buildHarness({ failCreditOnce: true });

  await assert.rejects(() =>
    harness.useCase.execute({
      walletId: 'wallet-1',
      currency: 'USD',
      amountCents: 1_000,
      actorId: 'actor-1',
      idempotencyKey: randomUUID(),
    }),
  );

  assert.equal(harness.outboxEvents.length, 0, "aucun événement Outbox ne doit être créé si le crédit échoue");
});

test('rollback: si Outbox échoue, aucune WalletTransaction ni IdempotencyRecord ne persiste', async () => {
  const idempotencyRecords = new Map<string, IdempotencyRecord>();
  const transactions = new Map<string, WalletTransactionDto>();
  const outboxEvents: DomainEventEnvelope<WalletCreditedPayload>[] = [];

  const walletRepository = {
    async creditWithinTransaction(_tx: unknown, params: CreditWalletParams): Promise<WalletTransactionDto> {
      const dto: WalletTransactionDto = Object.freeze({
        id: params.transactionId,
        walletId: params.walletId,
        currency: params.currency,
        amountCents: params.amountCents,
        type: 'CREDIT' as any,
        status: 'SETTLED' as any,
        actorId: params.actorId,
        transactionKey: params.transactionKey ?? null,
        relatedEntityType: null,
        relatedEntityId: null,
        reversalOfTransactionId: null,
        occurredAt: new Date().toISOString(),
        metadata: {},
      });
      transactions.set(dto.id, dto);
      return dto;
    },
    async getTransactionById(id: string): Promise<WalletTransactionDto | null> {
      return transactions.get(id) ?? null;
    },
    async findTransactionByKey(): Promise<WalletTransactionDto | null> {
      return null;
    },
  };

  const deps: CreditWalletDependencies = {
    prisma: {
      async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
        const idempotencySnapshot = new Map(idempotencyRecords);
        const transactionsSnapshot = new Map(transactions);
        try {
          return await fn({});
        } catch (err) {
          idempotencyRecords.clear();
          for (const [k, v] of idempotencySnapshot) idempotencyRecords.set(k, v);
          transactions.clear();
          for (const [k, v] of transactionsSnapshot) transactions.set(k, v);
          throw err;
        }
      },
    },
    walletRepository: walletRepository as any,
    idempotencyStore: new FakeIdempotencyStore(idempotencyRecords),
    createIdempotencyStore: () => new FakeIdempotencyStore(idempotencyRecords),
    createOutboxStore: () => ({
      append: async () => {
        throw new Error('simulated outbox failure');
      },
      claimBatch: (): never => {
        throw new Error('not used');
      },
      markPublished: (): never => {
        throw new Error('not used');
      },
      markFailed: (): never => {
        throw new Error('not used');
      },
    }),
  };

  const useCase = new CreditWalletUseCase(deps);

  await assert.rejects(() =>
    useCase.execute({
      walletId: 'wallet-1',
      currency: 'USD',
      amountCents: 1_000,
      actorId: 'actor-1',
      idempotencyKey: randomUUID(),
    }),
  );

  assert.equal(transactions.size, 0, 'aucune WalletTransaction ne doit persister après un rollback');
  assert.equal(idempotencyRecords.size, 0, 'aucun IdempotencyRecord ne doit persister après un rollback');
  assert.equal(outboxEvents.length, 0);
});

test('rejeu: le résultat renvoyé au second appel est identique au premier', async () => {
  const harness = buildHarness();
  const idempotencyKey = randomUUID();
  const command = {
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 750,
    actorId: 'actor-1',
    idempotencyKey,
  };

  const first = await harness.useCase.execute(command);
  const second = await harness.useCase.execute(command);

  assert.deepEqual(second.transaction, first.transaction);
});

test('transactionKey explicite: crédit avec transactionKey', async () => {
  const harness = buildHarness();

  const result = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
    transactionKey: 'business-ref-42',
  });

  assert.equal(result.transaction.transactionKey, 'business-ref-42');
});

test('transactionKey absent: reste NULL, sans dérivation depuis Idempotency-Key', async () => {
  const harness = buildHarness();
  const idempotencyKey = randomUUID();

  const result = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey,
  });

  assert.equal(result.transaction.transactionKey, null);
  assert.notEqual(result.transaction.transactionKey, idempotencyKey);
});

// --- A. Collision séquentielle : idempotencyKey différentes, même transactionKey ---
test('deux Idempotency-Key différentes avec le même transactionKey métier: la seconde reçoit TransactionKeyConflictError', async () => {
  const harness = buildHarness();

  const first = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
    transactionKey: 'momo:shared-ref',
  });

  const secondIdempotencyKey = randomUUID();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: 1_000,
        actorId: 'actor-2',
        idempotencyKey: secondIdempotencyKey,
        transactionKey: 'momo:shared-ref', // même référence métier, jamais réparé silencieusement
      }),
    isTransactionKeyConflictError,
  );

  // Une seule WalletTransaction et un seul événement Outbox existent.
  assert.equal(harness.transactions.size, 1, 'un seul mouvement financier ne doit exister pour cette référence métier');
  assert.equal(harness.outboxEvents.length, 1, 'un seul événement Outbox ne doit être émis pour cette référence métier');

  // Seule la première Idempotency-Key a un IdempotencyRecord durable.
  // La tentative perdante n'en laisse aucun résidu (rollback complet).
  assert.equal(harness.idempotencyRecords.size, 1, 'la tentative perdante ne doit laisser aucun IdempotencyRecord résiduel');
  assert.equal(harness.idempotencyRecords.has(`${secondIdempotencyKey}:wallet.credit`), false);
  for (const record of harness.idempotencyRecords.values()) {
    assert.equal(record.resultReference, first.transaction.id);
  }
});

test('retry après conflit: la même Idempotency-Key avec un transactionKey différent réussit normalement', async () => {
  const harness = buildHarness();

  await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey: randomUUID(),
    transactionKey: 'momo:shared-ref',
  });

  const retryIdempotencyKey = randomUUID();
  await assert.rejects(
    () =>
      harness.useCase.execute({
        walletId: 'wallet-1',
        currency: 'USD',
        amountCents: 500,
        actorId: 'actor-2',
        idempotencyKey: retryIdempotencyKey,
        transactionKey: 'momo:shared-ref',
      }),
    isTransactionKeyConflictError,
  );

  // La même Idempotency-Key, réessayée avec un transactionKey DIFFÉRENT,
  // doit réussir normalement — l'échec précédent ne l'a pas "brûlée".
  const retryResult = await harness.useCase.execute({
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 500,
    actorId: 'actor-2',
    idempotencyKey: retryIdempotencyKey,
    transactionKey: 'momo:another-ref',
  });

  assert.equal(retryResult.replayed, false);
  assert.equal(retryResult.transaction.transactionKey, 'momo:another-ref');
  assert.equal(harness.transactions.size, 2);
});

test('même Idempotency-Key et même transactionKey: rejeu normal, jamais TransactionKeyConflictError', async () => {
  const harness = buildHarness();
  const idempotencyKey = randomUUID();
  const command = {
    walletId: 'wallet-1',
    currency: 'USD',
    amountCents: 1_000,
    actorId: 'actor-1',
    idempotencyKey,
    transactionKey: 'order:1:credit',
  };

  const first = await harness.useCase.execute(command);
  const second = await harness.useCase.execute(command);

  assert.equal(second.replayed, true);
  assert.equal(second.transaction.id, first.transaction.id);
  assert.equal(harness.transactions.size, 1);
});
