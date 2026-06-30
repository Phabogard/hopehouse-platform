import { ForbiddenError } from '../../core/errors.js';
import { type Permission, rolePermissions, type Role } from './permissions.js';

export interface Actor {
  id: string;
  role: Role;
}

export function can(actor: Actor, permission: Permission): boolean {
  return rolePermissions[actor.role].includes(permission);
}

export function authorize(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new ForbiddenError(`Permission requise: ${permission}`);
  }
}
