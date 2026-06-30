import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../core/errors.js';
import { type EntityStatus } from '../../core/types.js';
import { type Role } from '../rbac/permissions.js';

export interface User {
  id: string;
  email: string;
  displayName: string;
  status: EntityStatus;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export function createUser(input: { email: string; displayName: string; role: Role }): User {
  if (!input.email.includes('@')) throw new ValidationError('Adresse e-mail invalide');
  if (input.displayName.trim().length < 2) throw new ValidationError('Le nom affiché est obligatoire');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    email: input.email.toLowerCase(),
    displayName: input.displayName.trim(),
    status: 'active',
    role: input.role,
    createdAt: now,
    updatedAt: now,
  };
}
