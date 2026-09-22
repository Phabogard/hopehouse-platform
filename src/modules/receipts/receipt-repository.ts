export interface ReceiptRecord {
  readonly id: string;
  readonly rechargeAttemptId: string;
  readonly orderId: string;
  readonly walletId: string;
  readonly receiptNumber: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly issuedAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly walletOwnerType: string;
  readonly walletOwnerId: string;
  readonly orderRequesterActorId: string;
  readonly orderBeneficiaryId: string | null;
}

export interface ReceiptRepository {
  getById(receiptId: string): Promise<ReceiptRecord | null>;
}
