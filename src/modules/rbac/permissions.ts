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

export type Role =
  | 'system_admin'
  | 'business_admin'
  | 'operations_agent'
  | 'finance_manager'
  | 'accountant'
  | 'auditor';

export const rolePermissions: Record<Role, readonly Permission[]> = {
  system_admin: ['users:read', 'users:manage', 'roles:manage', 'beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'invoices:read', 'audit:read'],
  business_admin: ['users:read', 'beneficiaries:read', 'beneficiaries:manage', 'services:read', 'services:manage', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  operations_agent: ['beneficiaries:read', 'beneficiaries:manage', 'services:read', 'subscriptions:read', 'subscriptions:manage', 'payments:read', 'payments:create', 'invoices:read'],
  finance_manager: ['beneficiaries:read', 'services:read', 'subscriptions:read', 'payments:read', 'payments:create', 'payments:validate', 'invoices:read', 'invoices:manage', 'accounting:export'],
  accountant: ['payments:read', 'invoices:read', 'accounting:export'],
  auditor: ['audit:read'],
};
