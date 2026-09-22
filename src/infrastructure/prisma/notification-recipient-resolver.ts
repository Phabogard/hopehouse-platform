import type { NotificationRecipientResolver } from '../../modules/notifications/notification-recipient-resolver.js';
import { PrismaWalletRepository, WalletNotFoundError } from '../../modules/wallets/prisma-wallet-repository.js';

export class PrismaNotificationRecipientResolver implements NotificationRecipientResolver {
  constructor(private readonly walletRepository: PrismaWalletRepository) {}

  async resolveUserIdForWallet(walletId: string): Promise<string> {
    const state = await this.walletRepository.getWalletById(walletId);
    if (state === null) {
      throw new WalletNotFoundError(`Wallet not found: ${walletId}`);
    }

    if (state.wallet.ownerType !== 'USER') {
      throw new Error(
        `Wallet ${walletId} is not user-owned (ownerType=${state.wallet.ownerType})`,
      );
    }

    return state.wallet.ownerId;
  }
}
