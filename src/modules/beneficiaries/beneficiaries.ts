import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';
import { type EntityStatus } from '../../core/types.js';

export interface Beneficiary {
  id: string;
  reference: string;
  displayName: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export function createBeneficiary(input: { reference: string; displayName: string }): Beneficiary {
  if (input.reference.trim().length < 2) throw new ValidationError('La référence bénéficiaire est obligatoire');
  if (input.displayName.trim().length < 2) throw new ValidationError('Le nom du bénéficiaire est obligatoire');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    reference: input.reference.trim(),
    displayName: input.displayName.trim(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}
