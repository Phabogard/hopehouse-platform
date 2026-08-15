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
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
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


-- Paramètres configurables globaux et politiques transverses.
-- app_settings est la source unique des paramètres configurables, y compris les politiques de sécurité.
CREATE TABLE app_settings (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  key TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  value_json JSONB NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by_user_id TEXT REFERENCES users(id),
  updated_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL,
  CHECK ((scope_type = 'global' AND scope_id IS NULL) OR (scope_type <> 'global' AND scope_id IS NOT NULL))
);

-- PostgreSQL 15+ : garantit l'unicité logique même lorsque scope_id est NULL.
CREATE UNIQUE INDEX app_settings_unique_identity
  ON app_settings (namespace, key, scope_type, scope_id, status) NULLS NOT DISTINCT;
CREATE INDEX app_settings_namespace_key_status_idx ON app_settings (namespace, key, status);
CREATE INDEX app_settings_scope_status_idx ON app_settings (scope_type, scope_id, status);
CREATE INDEX app_settings_validity_idx ON app_settings (starts_at, ends_at);

CREATE TABLE auth_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_type TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'rotated', 'archived')),
  last_changed_at TIMESTAMPTZ NOT NULL,
  must_rotate_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE device_fingerprints (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fingerprint_hash TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'trusted', 'untrusted', 'revoked', 'archived')),
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  metadata_json JSONB NOT NULL,
  UNIQUE (user_id, fingerprint_hash)
);

CREATE TABLE login_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_fingerprint_id TEXT REFERENCES device_fingerprints(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired', 'archived')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by_user_id TEXT REFERENCES users(id),
  revocation_reason TEXT,
  metadata_json JSONB NOT NULL
);

CREATE TABLE session_refresh_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES login_sessions(id),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked', 'expired', 'reused')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_id TEXT REFERENCES session_refresh_tokens(id),
  metadata_json JSONB NOT NULL
);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  identifier_hash TEXT NOT NULL,
  device_fingerprint_id TEXT REFERENCES device_fingerprints(id),
  ip_address_hash TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'blocked')),
  failure_reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'medium', 'major', 'critical')),
  related_entity_type TEXT,
  related_entity_id TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE password_reset_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  identifier_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE two_factor_settings (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'archived')),
  configuration_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE two_factor_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  session_id TEXT REFERENCES login_sessions(id),
  action TEXT NOT NULL,
  method TEXT NOT NULL,
  challenge_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'expired')),
  attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL CHECK (max_attempts > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL
);

CREATE TABLE admin_access_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  session_id TEXT REFERENCES login_sessions(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL
);


CREATE INDEX auth_credentials_user_type_status_idx ON auth_credentials (user_id, credential_type, status);
CREATE INDEX auth_credentials_must_rotate_at_idx ON auth_credentials (must_rotate_at);
CREATE INDEX device_fingerprints_user_status_idx ON device_fingerprints (user_id, status);
CREATE INDEX device_fingerprints_last_seen_at_idx ON device_fingerprints (last_seen_at);
CREATE INDEX device_fingerprints_revoked_at_idx ON device_fingerprints (revoked_at);
CREATE INDEX login_sessions_user_status_idx ON login_sessions (user_id, status);
CREATE INDEX login_sessions_device_status_idx ON login_sessions (device_fingerprint_id, status);
CREATE INDEX login_sessions_expires_at_idx ON login_sessions (expires_at);
CREATE INDEX login_sessions_idle_expires_at_idx ON login_sessions (idle_expires_at);
CREATE INDEX login_sessions_revoked_at_idx ON login_sessions (revoked_at);
CREATE INDEX session_refresh_tokens_session_status_idx ON session_refresh_tokens (session_id, status);
CREATE INDEX session_refresh_tokens_expires_at_idx ON session_refresh_tokens (expires_at);
CREATE INDEX session_refresh_tokens_replaced_by_idx ON session_refresh_tokens (replaced_by_token_id);
CREATE INDEX login_attempts_identifier_outcome_occurred_idx ON login_attempts (identifier_hash, outcome, occurred_at);
CREATE INDEX login_attempts_user_occurred_idx ON login_attempts (user_id, occurred_at);
CREATE INDEX login_attempts_ip_occurred_idx ON login_attempts (ip_address_hash, occurred_at);
CREATE INDEX login_attempts_device_occurred_idx ON login_attempts (device_fingerprint_id, occurred_at);
CREATE INDEX security_events_user_occurred_idx ON security_events (user_id, occurred_at);
CREATE INDEX security_events_actor_occurred_idx ON security_events (actor_user_id, occurred_at);
CREATE INDEX security_events_type_occurred_idx ON security_events (event_type, occurred_at);
CREATE INDEX security_events_severity_occurred_idx ON security_events (severity, occurred_at);
CREATE INDEX security_events_related_entity_idx ON security_events (related_entity_type, related_entity_id);
CREATE INDEX password_reset_requests_identifier_created_idx ON password_reset_requests (identifier_hash, created_at);
CREATE INDEX password_reset_requests_user_status_created_idx ON password_reset_requests (user_id, status, created_at);
CREATE INDEX password_reset_requests_status_expires_idx ON password_reset_requests (status, expires_at);
CREATE INDEX two_factor_settings_scope_status_idx ON two_factor_settings (scope_type, scope_id, status);
CREATE INDEX two_factor_settings_method_status_idx ON two_factor_settings (method, status);
CREATE INDEX two_factor_challenges_user_status_created_idx ON two_factor_challenges (user_id, status, created_at);
CREATE INDEX two_factor_challenges_status_expires_idx ON two_factor_challenges (status, expires_at);
CREATE INDEX two_factor_challenges_session_idx ON two_factor_challenges (session_id);
CREATE INDEX two_factor_challenges_action_status_created_idx ON two_factor_challenges (action, status, created_at);
CREATE INDEX admin_access_logs_actor_started_idx ON admin_access_logs (actor_user_id, started_at);
CREATE INDEX admin_access_logs_target_started_idx ON admin_access_logs (target_user_id, started_at);
CREATE INDEX admin_access_logs_action_started_idx ON admin_access_logs (action, started_at);
CREATE INDEX admin_access_logs_session_idx ON admin_access_logs (session_id);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (owner_type, owner_id)
);

CREATE TABLE wallet_balances (
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  currency TEXT NOT NULL,
  available_cents INTEGER NOT NULL CHECK (available_cents >= 0),
  reserved_cents INTEGER NOT NULL CHECK (reserved_cents >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wallet_id, currency)
);

CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'reservation', 'release', 'capture', 'rollback')),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  actor_user_id TEXT REFERENCES users(id),
  transaction_key TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  reversal_of_transaction_id TEXT REFERENCES wallet_transactions(id),
  reservation_id TEXT,
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  UNIQUE (wallet_id, transaction_key)
);

CREATE TABLE wallet_reservations (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'released', 'captured', 'rolled_back')),
  created_by_transaction_id TEXT NOT NULL REFERENCES wallet_transactions(id),
  closed_by_transaction_id TEXT REFERENCES wallet_transactions(id),
  related_entity_type TEXT,
  related_entity_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE wallet_audit_events (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  transaction_id TEXT NOT NULL REFERENCES wallet_transactions(id),
  action TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
  occurred_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE,
  requester_user_id TEXT REFERENCES users(id),
  client_profile_id TEXT REFERENCES client_profiles(id),
  agent_profile_id TEXT REFERENCES agent_profiles(id),
  current_step TEXT NOT NULL CHECK (current_step IN ('creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit')),
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id),
  mode TEXT NOT NULL CHECK (mode IN ('manual', 'semi_automatic', 'automatic')),
  beneficiary_id TEXT,
  channel TEXT,
  currency TEXT,
  total_cents INTEGER CHECK (total_cents >= 0),
  metadata_json TEXT NOT NULL,
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
  step TEXT NOT NULL CHECK (step IN ('creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit')),
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

CREATE TABLE order_transitions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  from_step TEXT CHECK (from_step IN ('creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit')),
  to_step TEXT NOT NULL CHECK (to_step IN ('creation', 'validation', 'payment', 'execution', 'notification', 'receipt', 'history', 'audit')),
  outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed')),
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
