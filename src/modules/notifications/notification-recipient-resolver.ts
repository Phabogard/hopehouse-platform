export interface NotificationRecipientResolver {
  /**
   * Resolve the application user that owns a wallet.
   *
   * Notification device registration is keyed by userId, not walletId.
   */
  resolveUserIdForWallet(walletId: string): Promise<string>;
}
