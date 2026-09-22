import { ForbiddenError, ValidationError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import type { ReceiptRecord, ReceiptRepository } from './receipt-repository.js';

export class ReceiptService {
  constructor(private readonly repository: ReceiptRepository) {}

  async getReceiptForActor(receiptId: string, actor: Actor): Promise<ReceiptRecord> {
    if (!receiptId || receiptId.trim().length === 0) {
      throw new ValidationError('L\'identifiant du reçu est obligatoire');
    }

    const receipt = await this.repository.getById(receiptId);
    if (!receipt) {
      throw new ValidationError('Reçu introuvable');
    }

    const hasGlobalAccess = ['system_admin', 'business_admin', 'finance_manager', 'accountant', 'auditor'].includes(actor.role);
    if (hasGlobalAccess) {
      return receipt;
    }

    const isWalletOwner = receipt.walletOwnerType === 'USER' && receipt.walletOwnerId === actor.id;
    const isOrderRequester = receipt.orderRequesterActorId === actor.id;
    const isOrderBeneficiary = receipt.orderBeneficiaryId !== null && receipt.orderBeneficiaryId === actor.id;

    if (!isWalletOwner && !isOrderRequester && !isOrderBeneficiary) {
      throw new ForbiddenError('Accès non autorisé à ce reçu');
    }

    return receipt;
  }
}
