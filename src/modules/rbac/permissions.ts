export const permissions = [
  'users:read',
  'users:manage',
  'roles:manage',
  'beneficiaries:read',
  'beneficiaries:manage',
  'services:read',
  'services:manage',
  'subscriptions:read',
  'subscriptions:manage',
  'payments:read',
  'payments:create',
  'payments:validate',
  'invoices:read',
  'invoices:manage',
  'accounting:export',
  'audit:read',
] as const;

export type Permission = (typeof permissions)[number];

export type OfficialBusinessRole = 'Super Admin' | 'Administrateur' | 'Agent' | 'Client' | 'Comptable' | 'Auditeur';

export type Role =
  | 'system_admin'
  | 'business_admin'
  | 'operations_agent'
  | 'finance_manager'
  | 'client'
  | 'accountant'
  | 'auditor';

export const officialBusinessRoleByTechnicalRole = Object.freeze({
  system_admin: 'Super Admin',
  business_admin: 'Administrateur',
  operations_agent: 'Agent',
  client: 'Client',
  accountant: 'Comptable',
  auditor: 'Auditeur',
} satisfies Record<Exclude<Role, 'finance_manager'>, OfficialBusinessRole>);

export const historicalTransitionalRoles = Object.freeze({
  finance_manager: 'Rôle historique/transitoire de supervision financière conservé par compatibilité avec la matrice technique actuelle.',
} satisfies Record<Extract<Role, 'finance_manager'>, string>);

export const technicalRoles = Object.freeze([
  'system_admin',
  'business_admin',
  'operations_agent',
  'finance_manager',
  'client',
  'accountant',
  'auditor',
] as const satisfies readonly Role[]);

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (technicalRoles as readonly string[]).includes(value);
}

export const rolePermissions: Record<Role, readonly Permission[]> = {
  system_admin: ['users:read', 'users:manage', 'roles:manage', 'beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'invoices:read', 'audit:read'],
  business_admin: ['users:read', 'beneficiaries:read', 'beneficiaries:manage', 'services:read', 'services:manage', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  operations_agent: ['beneficiaries:read', 'beneficiaries:manage', 'services:read', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  finance_manager: ['beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'payments:create', 'payments:validate', 'invoices:read', 'invoices:manage', 'accounting:export'],
  client: [],
  accountant: ['payments:read', 'invoices:read', 'accounting:export'],
  auditor: ['audit:read'],
};
