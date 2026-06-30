import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export type SubscriptionStatus = 'draft' | 'active' | 'suspended' | 'terminated' | 'expired' | 'archived';

export interface Subscription {
  id: string;
  beneficiaryId: string;
  serviceId: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createSubscription(input: { beneficiaryId: string; serviceId: string; startDate: string; endDate?: string | null }): Subscription {
  if (!input.beneficiaryId) throw new ValidationError('Le bénéficiaire est obligatoire');
  if (!input.serviceId) throw new ValidationError('Le service est obligatoire');
  if (!input.startDate) throw new ValidationError('La date de début est obligatoire');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    beneficiaryId: input.beneficiaryId,
    serviceId: input.serviceId,
    status: 'draft',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
