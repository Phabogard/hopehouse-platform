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
