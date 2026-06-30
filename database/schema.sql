-- Schéma conceptuel SQL initial pour Hope House ERP.
-- Ce fichier sert de référence de conception et n'est pas encore une migration de production.

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id),
  permission_id TEXT NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  role_id TEXT NOT NULL REFERENCES roles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE beneficiaries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  is_billable INTEGER NOT NULL CHECK (is_billable IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  beneficiary_id TEXT NOT NULL REFERENCES beneficiaries(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'suspended', 'terminated', 'expired', 'archived')),
  start_date TEXT NOT NULL,
  end_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  beneficiary_id TEXT NOT NULL REFERENCES beneficiaries(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'reconciled')),
  payment_method TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  beneficiary_id TEXT NOT NULL REFERENCES beneficiaries(id),
  invoice_number TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue', 'archived')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency TEXT NOT NULL,
  issued_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
