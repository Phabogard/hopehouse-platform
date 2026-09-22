import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaNotificationRecipientResolver } from '../src/infrastructure/prisma/notification-recipient-resolver.js';
import type { PrismaWalletRepository } from '../src/modules/wallets/prisma-wallet-repository.js';

function repositoryReturning(state: Awaited<ReturnType<PrismaWalletRepository['getWalletById']>>): PrismaWalletRepository {
  return {
    getWalletById: async () => state,
  } as unknown as PrismaWalletRepository;
}

test('PrismaNotificationRecipientResolver returns the user owner id', async () => {
  const resolver = new PrismaNotificationRecipientResolver(
    repositoryReturning({
      wallet: {
        id: 'wal-1',
        ownerType: 'USER',
        ownerId: 'user-1',
        status: 'ACTIVE' as never,
        createdAt: '2026-09-22T10:00:00.000Z',
        updatedAt: '2026-09-22T10:00:00.000Z',
      },
      balances: [],
    }),
  );

  assert.equal(await resolver.resolveUserIdForWallet('wal-1'), 'user-1');
});

test('PrismaNotificationRecipientResolver rejects a missing wallet', async () => {
  const resolver = new PrismaNotificationRecipientResolver(repositoryReturning(null));

  await assert.rejects(
    resolver.resolveUserIdForWallet('missing'),
    (error: unknown) => error instanceof Error && error.message === 'Wallet not found: missing',
  );
});

test('PrismaNotificationRecipientResolver rejects non-user-owned wallets', async () => {
  const resolver = new PrismaNotificationRecipientResolver(
    repositoryReturning({
      wallet: {
        id: 'wal-2',
        ownerType: 'ORGANIZATION',
        ownerId: 'org-1',
        status: 'ACTIVE' as never,
        createdAt: '2026-09-22T10:00:00.000Z',
        updatedAt: '2026-09-22T10:00:00.000Z',
      },
      balances: [],
    }),
  );

  await assert.rejects(
    resolver.resolveUserIdForWallet('wal-2'),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'Wallet wal-2 is not user-owned (ownerType=ORGANIZATION)',
  );
});
