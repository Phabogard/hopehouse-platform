import { ForbiddenError, ValidationError } from '../../core/errors.js';
import type { Actor } from '../rbac/authorize.js';
import type { ReceiptRecord, ReceiptRepository } from './receipt-repository.js';

const globalReceiptRoles = new Set<Actor['role']>([
  'system_admin',
  'business_admin',
  'finance_manager',
  'accountant',
  'auditor',
]);

export class ReceiptService {
  constructor(private readonly repository: ReceiptRepository) {}

  async getReceiptForActor(receiptId: string, actor: Actor): Promise<ReceiptRecord> {
    if (!receiptId || receiptId.trim().length === 0) {
      throw new ValidationError("L'identifiant du reçu est obligatoire");
    }

    const receipt = await this.repository.getById(receiptId);
    if (!receipt) throw new ValidationError('Reçu introuvable');

    if (globalReceiptRoles.has(actor.role)) return receipt;

    const isWalletOwner = receipt.walletOwnerType === 'USER' && receipt.walletOwnerId === actor.id;
    const isOrderRequester = receipt.orderRequesterActorId === actor.id;
    const isOrderBeneficiary = receipt.orderBeneficiaryId === actor.id;

    if (!isWalletOwner && !isOrderRequester && !isOrderBeneficiary) {
      throw new ForbiddenError('Accès non autorisé à ce reçu');
    }

    return receipt;
  }
}
