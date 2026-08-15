import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { permissions, rolePermissions } from '../src/modules/rbac/permissions.js';

function readProjectFile(path: string): string {
  return readFileSync(path, 'utf8');
}

test('official architecture documentation corpus is present', () => {
  const expectedDocuments = [
    '00-CONSTITUTION.md',
    '01-VISION-GLOBALE.md',
    '02-REGLES-METIER.md',
    '03-ARCHITECTURE-GENERALE.md',
    '04-MOTEUR-DE-COMMANDES.md',
    '05-CATALOGUES-DYNAMIQUES.md',
    '06-WALLETS.md',
    '07-CLIENT.md',
    '08-AGENT.md',
    '09-ADMINISTRATEUR.md',
    '10-SUPER-ADMIN.md',
    '11-COMPTABLE.md',
    '12-AUDITEUR.md',
    '13-MESSAGERIE.md',
    '14-NOTIFICATIONS.md',
    '15-QR-CODE.md',
    '16-SECURITE.md',
    '17-RBAC.md',
    '18-CONNECTEURS.md',
    '19-BASE-DE-DONNEES.md',
    '20-API.md',
    '21-DEVELOPPEMENT.md',
    '22-TESTS.md',
    '23-DEPLOIEMENT.md',
    '24-ROADMAP.md',
    '25-GLOSSAIRE.md',
    '26-DIAGRAMMES.md',
    '27-ANNEXES.md',
    '28-ECRANS-DETAILLES.md',
    '29-SERVICES-DETAILLES.md',
    '30-GUIDE-DEVELOPPEUR.md',
    '31-GUIDE-SUPER-ADMIN.md',
    '32-GUIDE-ONBOARDING-ROLES.md',
  ];

  for (const document of expectedDocuments) {
    assert.equal(readProjectFile(`docs/architecture-officielle/${document}`).includes('Statut normatif'), true, document);
  }
});

test('business domains are represented in docs, SQL schema, and API contract', () => {
  const businessRules = readProjectFile('docs/business/document-001-cahier-regles-metier.md');
  const schema = readProjectFile('database/schema.sql');
  const openApi = readProjectFile('docs/api/openapi.yaml');

  for (const domain of ['Utilisateurs', 'Bénéficiaires', 'Services', 'Abonnements', 'Paiements', 'Factures', 'Audit']) {
    assert.equal(businessRules.includes(domain), true, domain);
  }

  for (const table of ['users', 'beneficiaries', 'services', 'subscriptions', 'payments', 'invoices', 'audit_logs']) {
    assert.equal(schema.includes(`CREATE TABLE ${table}`), true, table);
  }

  for (const path of ['/users', '/beneficiaries', '/services', '/subscriptions', '/payments', '/invoices', '/audit-logs']) {
    assert.equal(openApi.includes(`  ${path}:`), true, path);
  }
});

test('official architecture corpus documents mandatory target capabilities', () => {
  const documents = [
    'docs/architecture-officielle/01-VISION-GLOBALE.md',
    'docs/architecture-officielle/02-REGLES-METIER.md',
    'docs/architecture-officielle/04-MOTEUR-DE-COMMANDES.md',
    'docs/architecture-officielle/05-CATALOGUES-DYNAMIQUES.md',
    'docs/architecture-officielle/06-WALLETS.md',
    'docs/architecture-officielle/10-SUPER-ADMIN.md',
    'docs/architecture-officielle/13-MESSAGERIE.md',
    'docs/architecture-officielle/15-QR-CODE.md',
    'docs/architecture-officielle/16-SECURITE.md',
    'docs/architecture-officielle/19-BASE-DE-DONNEES.md',
    'docs/architecture-officielle/20-API.md',
    'docs/architecture-officielle/26-DIAGRAMMES.md',
    'docs/architecture-officielle/27-ANNEXES.md',
    'docs/architecture-officielle/28-ECRANS-DETAILLES.md',
    'docs/architecture-officielle/29-SERVICES-DETAILLES.md',
    'docs/architecture-officielle/30-GUIDE-DEVELOPPEUR.md',
    'docs/architecture-officielle/31-GUIDE-SUPER-ADMIN.md',
  ].map(readProjectFile).join('\n');

  for (const requiredConcept of [
    'paiement, exécution, notification, reçu, historique, audit',
    'espèces physiques ne sont jamais enregistrées',
    'Dépôt Super Admin → Agent',
    'Dépôt Agent → Agent',
    'Retrait Client → Agent',
    'Marketplace accessoires',
    'Hope House est fournisseur officiel',
    'boutique Agent de type Shopify',
    'Login As',
    'mode privé',
    'QR transactionnel',
    'vérification automatique du nom',
    'blocage après 4 tentatives',
    '24 h par défaut',
    'fidélité',
    'parrainage',
    'promotions',
    'bonus',
    "Client ne peut jamais retirer auprès d'un autre Client",
    '5 minutes par défaut',
    'Annulation et récupération',
    'Ajouter un nouveau service sans modifier la logique métier',
    "Retrouver l'historique complet d'un argent",
    'POST /orders',
    'POST /marketplace/accessories/orders',
    'qr_codes',
    'device_fingerprints',
    'accessory_products',
    'Delivery',
    'Détection fraude',
  ]) {
    assert.equal(documents.includes(requiredConcept), true, requiredConcept);
  }
});

test('official command cycle is synchronized across docs, SQL, and OpenAPI', () => {
  const officialVision = readProjectFile('docs/architecture-officielle/01-VISION-GLOBALE.md');
  const commandEngine = readProjectFile('docs/architecture-officielle/04-MOTEUR-DE-COMMANDES.md');
  const legacyArchitecture = readProjectFile('docs/design/architecture-cible-commandes-configurables.md');
  const conceptualModel = readProjectFile('docs/design/modele-conceptuel-cible.md');
  const schema = readProjectFile('database/schema.sql');
  const openApi = readProjectFile('docs/api/openapi.yaml');

  for (const source of [officialVision, commandEngine, legacyArchitecture, conceptualModel, openApi]) {
    assert.equal(source.includes('paiement'), true);
  }

  assert.equal(schema.includes("'payment'"), true);
});

test('documented RBAC permissions stay synchronized with TypeScript permissions', () => {
  const matrix = readProjectFile('docs/design/matrice-rbac.md');

  for (const permission of permissions) {
    assert.equal(matrix.includes(`| ${permission} |`), true, permission);
  }

  for (const configuredPermissions of Object.values(rolePermissions)) {
    for (const permission of configuredPermissions) {
      assert.equal(permissions.includes(permission), true, permission);
    }
  }
});

test('OpenAPI create request schemas match currently implemented API create routes', () => {
  const openApi = readProjectFile('docs/api/openapi.yaml');
  const app = readProjectFile('src/app.ts');

  assert.equal(openApi.includes('CreateBeneficiaryRequest'), true);
  assert.equal(openApi.includes('CreatePaymentRequest'), true);
  assert.equal(app.includes("request.method === 'POST' && url.pathname === '/beneficiaries'"), true);
  assert.equal(app.includes("request.method === 'POST' && url.pathname === '/payments'"), true);
});

test('SQL status constraints include the statuses emitted by domain factories', () => {
  const schema = readProjectFile('database/schema.sql');

  assert.equal(schema.includes("status IN ('active', 'inactive', 'suspended', 'archived')"), true);
  assert.equal(schema.includes("status IN ('draft', 'active', 'suspended', 'archived')"), true);
  assert.equal(schema.includes("status IN ('draft', 'active', 'suspended', 'terminated', 'expired', 'archived')"), true);
  assert.equal(schema.includes("status IN ('initiated', 'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'reconciled')"), true);
  assert.equal(schema.includes("status IN ('draft', 'issued', 'partially_paid', 'paid', 'cancelled', 'overdue', 'archived')"), true);
});
test('OpenAPI documents the Authentification and Security Lot 1 contract', () => {
  const openApi = readProjectFile('docs/api/openapi.yaml');

  for (const requiredFragment of [
    'openapi: 3.1.0',
    'version: 0.2.0',
    '/auth/login:',
    '/auth/refresh:',
    '/auth/logout:',
    '/auth/password-reset/request:',
    '/auth/password-reset/confirm:',
    '/auth/2fa/challenges/{challengeId}/verify:',
    '/auth/sessions:',
    '/security/devices:',
    '/security/events:',
    '/admin/security/login-attempts:',
    '/admin/security/sessions:',
    '/admin/security/users/{userId}/unlock:',
    '/admin/security/users/{userId}/revoke-sessions:',
    '/admin/security/users/{userId}/revoke-devices:',
    '/admin/login-as:',
    'ErrorResponse:',
    'LoginRequest:',
    'RefreshTokenRequest:',
    'SessionResponse:',
    'DeviceResponse:',
    'SecurityEventResponse:',
    'rotation obligatoire',
    "empreinte hashée",
    'révocable globalement ou par appareil',
  ]) {
    assert.equal(openApi.includes(requiredFragment), true, requiredFragment);
  }
});

test('SQL documents configurable auth security tables without duplicating security policies', () => {
  const schema = readProjectFile('database/schema.sql');

  for (const table of [
    'app_settings',
    'auth_credentials',
    'device_fingerprints',
    'login_sessions',
    'session_refresh_tokens',
    'login_attempts',
    'security_events',
    'password_reset_requests',
    'two_factor_settings',
    'two_factor_challenges',
    'admin_access_logs',
  ]) {
    assert.equal(schema.includes(`CREATE TABLE ${table}`), true, table);
  }

  assert.equal(schema.includes('CREATE TABLE security_policies'), false);
  assert.equal(schema.includes('token_hash TEXT NOT NULL UNIQUE'), true);
  assert.equal(schema.includes('fingerprint_hash TEXT NOT NULL'), true);
  assert.equal(schema.includes("status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked', 'expired', 'reused'))"), true);
});

test('official docs keep auth security policies configurable through app settings', () => {
  const documents = [
    'docs/architecture-officielle/16-SECURITE.md',
    'docs/architecture-officielle/17-RBAC.md',
    'docs/architecture-officielle/19-BASE-DE-DONNEES.md',
    'docs/architecture-officielle/20-API.md',
    'docs/architecture-officielle/22-TESTS.md',
    'docs/architecture-officielle/23-DEPLOIEMENT.md',
  ].map(readProjectFile).join('\n');

  for (const requiredConcept of [
    'app_settings',
    'source unique des paramètres configurables',
    'refresh tokens sont rotatifs',
    'empreinte hashée',
    'révocation globale',
    'révocation par appareil',
    'Prisma ORM',
    'Neon PostgreSQL',
    'ne dépend jamais de Neon',
    'OpenAPI reste en version 3.1.0',
  ]) {
    assert.equal(documents.includes(requiredConcept), true, requiredConcept);
  }
});


test('database contract aligns app_settings and auth security Prisma/PostgreSQL safeguards', () => {
  const schema = readProjectFile('database/schema.sql');
  const prisma = readProjectFile('prisma/schema.prisma');
  const databaseDoc = readProjectFile('docs/architecture-officielle/19-BASE-DE-DONNEES.md');
  const securityDoc = readProjectFile('docs/architecture-officielle/16-SECURITE.md');

  assert.equal(schema.includes('CREATE UNIQUE INDEX app_settings_unique_identity'), true);
  assert.equal(schema.includes('NULLS NOT DISTINCT'), true);
  assert.equal(/CREATE UNIQUE INDEX app_settings_unique_identity\s+ON app_settings\s*\(\s*namespace,\s*key,\s*scope_type,\s*scope_id,\s*status\s*\)\s+NULLS NOT DISTINCT;/.test(schema), true);
  assert.equal(schema.includes("CHECK ((scope_type = 'global' AND scope_id IS NULL) OR (scope_type <> 'global' AND scope_id IS NOT NULL))"), true);
  assert.equal(prisma.includes('@@index([namespace, key, scopeType, scopeId, status])'), true);
  assert.equal(prisma.includes('NULLS NOT DISTINCT unique index'), true);
  assert.equal(prisma.includes('Prisma cannot express that index variant directly, so migrations must preserve it explicitly.'), true);
  assert.equal(databaseDoc.includes('NULLS NOT DISTINCT'), true);
  assert.equal(securityDoc.includes('NULLS NOT DISTINCT'), true);
});

test('database contract preserves scoped app_settings coexistence without nullable-global duplicates', () => {
  const schema = readProjectFile('database/schema.sql');

  assert.equal(schema.includes("scope_type = 'global' AND scope_id IS NULL"), true);
  assert.equal(schema.includes("scope_type <> 'global' AND scope_id IS NOT NULL"), true);
  assert.equal(schema.includes('ON app_settings (namespace, key, scope_type, scope_id, status) NULLS NOT DISTINCT'), true);
});

test('database contract aligns two factor challenge safety fields with Prisma', () => {
  const schema = readProjectFile('database/schema.sql');
  const prisma = readProjectFile('prisma/schema.prisma');

  assert.equal(schema.includes('attempt_count INTEGER NOT NULL CHECK (attempt_count >= 0)'), true);
  assert.equal(schema.includes('max_attempts INTEGER NOT NULL CHECK (max_attempts > 0)'), true);
  assert.equal(schema.includes('verified_at TIMESTAMPTZ'), true);
  assert.equal(prisma.includes('attemptCount  Int                      @map("attempt_count")'), true);
  assert.equal(prisma.includes('maxAttempts   Int                      @map("max_attempts")'), true);
  assert.equal(prisma.includes('verifiedAt    DateTime?                @map("verified_at")'), true);
});

test('database contract documents Prisma-aligned auth security indexes', () => {
  const schema = readProjectFile('database/schema.sql');

  for (const indexName of [
    'app_settings_unique_identity',
    'app_settings_namespace_key_status_idx',
    'app_settings_scope_status_idx',
    'app_settings_validity_idx',
    'login_sessions_user_status_idx',
    'login_sessions_device_status_idx',
    'login_sessions_expires_at_idx',
    'login_sessions_idle_expires_at_idx',
    'login_sessions_revoked_at_idx',
    'session_refresh_tokens_session_status_idx',
    'session_refresh_tokens_expires_at_idx',
    'session_refresh_tokens_replaced_by_idx',
    'login_attempts_identifier_outcome_occurred_idx',
    'login_attempts_user_occurred_idx',
    'login_attempts_ip_occurred_idx',
    'login_attempts_device_occurred_idx',
    'security_events_user_occurred_idx',
    'security_events_actor_occurred_idx',
    'security_events_type_occurred_idx',
    'security_events_severity_occurred_idx',
    'security_events_related_entity_idx',
    'password_reset_requests_identifier_created_idx',
    'password_reset_requests_user_status_created_idx',
    'password_reset_requests_status_expires_idx',
    'two_factor_settings_scope_status_idx',
    'two_factor_settings_method_status_idx',
    'two_factor_challenges_user_status_created_idx',
    'two_factor_challenges_status_expires_idx',
    'two_factor_challenges_session_idx',
    'two_factor_challenges_action_status_created_idx',
    'admin_access_logs_actor_started_idx',
    'admin_access_logs_target_started_idx',
    'admin_access_logs_action_started_idx',
    'admin_access_logs_session_idx',
  ]) {
    assert.equal(schema.includes(indexName), true, indexName);
  }
});
