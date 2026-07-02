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

-- -----------------------------------------------------------------------------
-- Modèle conceptuel cible configurable.
-- Cette section documente l'architecture cible et n'est pas une migration de production.
-- Les tables MVP ci-dessus restent conservées pour préserver le socle existant.
-- -----------------------------------------------------------------------------

CREATE TABLE target_user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  assigned_at TEXT NOT NULL,
  assigned_by_user_id TEXT REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE client_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE catalogs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  catalog_id TEXT NOT NULL REFERENCES catalogs(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (catalog_id, code)
);

CREATE TABLE networks (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE service_definitions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  network_id TEXT REFERENCES networks(id),
  provider_id TEXT REFERENCES providers(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'inactive', 'archived')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE service_modes (
  id TEXT PRIMARY KEY,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id),
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'semi_automatic', 'automatic')),
  is_active INTEGER NOT NULL CHECK (is_active IN (0, 1)),
  configuration_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (service_definition_id, mode)
);

CREATE TABLE price_rules (
  id TEXT PRIMARY KEY,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CDF')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  starts_at TEXT,
  ends_at TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE commission_rules (
  id TEXT PRIMARY KEY,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CDF')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('fixed', 'percentage')),
  value INTEGER NOT NULL CHECK (value >= 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  starts_at TEXT,
  ends_at TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('agent', 'client')),
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_type, owner_id)
);

CREATE TABLE wallet_balances (
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CDF')),
  available_cents INTEGER NOT NULL CHECK (available_cents >= 0),
  reserved_cents INTEGER NOT NULL CHECK (reserved_cents >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet_id, currency)
);

CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CDF')),
  amount_cents INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'sale', 'refund', 'commission', 'correction', 'reservation', 'release')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  related_entity_type TEXT,
  related_entity_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE,
  requester_user_id TEXT REFERENCES users(id),
  client_profile_id TEXT REFERENCES client_profiles(id),
  agent_profile_id TEXT REFERENCES agent_profiles(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending_validation', 'pending_execution', 'executed', 'notified', 'receipt_generated', 'completed', 'failed', 'cancelled', 'archived')),
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'semi_automatic', 'automatic')),
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'CDF')),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  metadata_json TEXT NOT NULL
);

CREATE TABLE order_steps (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  step TEXT NOT NULL CHECK (step IN ('creation', 'validation', 'execution', 'notification', 'receipt', 'history', 'audit')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'skipped')),
  actor_user_id TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE order_attempts (
  id TEXT PRIMARY KEY,
  requester_user_id TEXT REFERENCES users(id),
  service_definition_id TEXT REFERENCES service_definitions(id),
  reason TEXT NOT NULL,
  currency TEXT CHECK (currency IN ('USD', 'CDF')),
  requested_amount_cents INTEGER CHECK (requested_amount_cents >= 0),
  available_amount_cents INTEGER CHECK (available_amount_cents >= 0),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE order_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT REFERENCES users(id),
  recipient_role_id TEXT REFERENCES roles(id),
  related_entity_type TEXT NOT NULL,
  related_entity_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'read', 'archived')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  read_at TEXT,
  metadata_json TEXT NOT NULL
);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  receipt_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('generated', 'delivered', 'cancelled', 'archived')),
  generated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE connectors (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  configuration_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE connector_bindings (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL REFERENCES connectors(id),
  provider_id TEXT REFERENCES providers(id),
  network_id TEXT REFERENCES networks(id),
  service_definition_id TEXT REFERENCES service_definitions(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
