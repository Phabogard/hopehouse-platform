import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'cancelled' | 'overdue' | 'archived';

export interface Invoice {
  id: string;
  beneficiaryId: string;
  invoiceNumber: string | null;
  status: InvoiceStatus;
  totalCents: number;
  currency: string;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createInvoice(input: { beneficiaryId: string; totalCents: number; currency: string }): Invoice {
  if (!input.beneficiaryId) throw new ValidationError('Le bénéficiaire est obligatoire');
  if (!Number.isInteger(input.totalCents) || input.totalCents < 0) throw new ValidationError('Le total de facture doit être un entier positif ou nul');
  if (input.currency.trim().length !== 3) throw new ValidationError('La devise doit utiliser un code à trois caractères');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    beneficiaryId: input.beneficiaryId,
    invoiceNumber: null,
    status: 'draft',
    totalCents: input.totalCents,
    currency: input.currency.toUpperCase(),
    issuedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}
