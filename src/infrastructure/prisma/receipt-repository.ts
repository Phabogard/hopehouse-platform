import type { PrismaClient } from '@prisma/client';
import type { ReceiptRecord, ReceiptRepository } from '../../modules/receipts/receipt-repository.js';

export class PrismaReceiptRepository implements ReceiptRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getById(receiptId: string): Promise<ReceiptRecord | null> {
    const row = await this.prisma.walletReceipt.findUnique({
      where: { id: receiptId },
      include: {
        wallet: { select: { ownerType: true, ownerId: true } },
        order: { select: { requesterActorId: true, beneficiaryId: true } },
      },
    });

    if (!row) return null;

    const metadata = typeof row.metadataJson === 'object' && row.metadataJson !== null
      ? (row.metadataJson as Record<string, unknown>)
      : {};

    return Object.freeze({
      id: row.id,
      rechargeAttemptId: row.rechargeAttemptId,
      orderId: row.orderId,
      walletId: row.walletId,
      receiptNumber: row.receiptNumber,
      amountCents: Number(row.amountCents),
      currency: row.currency,
      issuedAt: row.issuedAt.toISOString(),
      metadata: Object.freeze(metadata),
      walletOwnerType: row.wallet.ownerType,
      walletOwnerId: row.wallet.ownerId,
      orderRequesterActorId: row.order.requesterActorId,
      orderBeneficiaryId: row.order.beneficiaryId,
    });
  }
}
