import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export type PaymentStatus = 'initiated' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded' | 'reconciled';

export interface Payment {
  id: string;
  beneficiaryId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: string | null;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
}

export function createPayment(input: { beneficiaryId: string; amountCents: number; currency: string; paymentMethod?: string | null }): Payment {
  if (!input.beneficiaryId) throw new ValidationError('Le bénéficiaire est obligatoire');
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new ValidationError('Le montant du paiement doit être un entier positif ou nul');
  if (input.currency.trim().length !== 3) throw new ValidationError('La devise doit utiliser un code à trois caractères');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    beneficiaryId: input.beneficiaryId,
    amountCents: input.amountCents,
    currency: input.currency.toUpperCase(),
    status: 'initiated',
    paymentMethod: input.paymentMethod ?? null,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
  };
}
