import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';

export type ServiceStatus = 'draft' | 'active' | 'suspended' | 'archived';

export interface ServiceOffering {
  id: string;
  name: string;
  description: string;
  status: ServiceStatus;
  isBillable: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createServiceOffering(input: { name: string; description?: string; isBillable: boolean }): ServiceOffering {
  if (input.name.trim().length < 2) throw new ValidationError('Le nom du service est obligatoire');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    status: 'draft',
    isBillable: input.isBillable,
    createdAt: now,
    updatedAt: now,
  };
}
