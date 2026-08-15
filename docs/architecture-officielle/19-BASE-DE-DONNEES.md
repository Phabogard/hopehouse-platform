# Base de données

## Cible

PostgreSQL est la cible. Prisma est le modèle ORM de référence et la future source des migrations versionnées. Le fichier `database/schema.sql` est un contrat SQL documentaire aligné avec Prisma/PostgreSQL; il ne constitue pas une migration de production. Les migrations futures doivent être versionnées, réversibles lorsque possible, testées et compatibles avec les données existantes.

## Tables MVP actuelles

roles, permissions, role_permissions, users, beneficiaries, services, subscriptions, payments, invoices et audit_logs sont le socle initial. Elles restent compatibles mais doivent évoluer vers la cible configurable.

## Tables cibles déjà esquissées dans le SQL

client_profiles, agent_profiles, catalogs, catalog_items, networks, providers, service_definitions, service_modes, price_rules, commission_rules, wallets, wallet_balances, wallet_transactions, orders, order_items, order_steps, order_attempts, order_history, notifications, receipts, connectors et connector_bindings.

## Tables futures obligatoires non encore présentes

qr_codes, withdrawal_codes, device_fingerprints, login_attempts, login_sessions, security_events, conversations, conversation_participants, messages, message_receipts, message_media, groups, communities, announcements, statuses, polls, meetings, loyalty_accounts, loyalty_transactions, referral_codes, referral_rewards, promotions, accessory_products, central_stock_movements, agent_stock_items, agent_shop_products, app_settings et admin_access_logs.

## Contraintes

Les soldes disponibles/réservés ne deviennent jamais négatifs. Les suppressions sont logiques. Les audits et historiques sont append-only. Les clés fonctionnelles doivent éviter la duplication. Les index couvrent recherche, historique, reporting, sécurité et idempotence.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.


## Dictionnaire détaillé des tables actuelles

### roles
Rôle : référentiel des rôles configurables. Colonnes : id TEXT PK, name TEXT UNIQUE, description TEXT. Contraintes : unicité du nom. Relations : role_permissions, users.role_id transitoire. Règles : suppression logique cible à ajouter avant production.

### permissions
Rôle : référentiel des permissions configurables. Colonnes : id TEXT PK, description TEXT. Relations : role_permissions. Règles : toute permission utilisée par une API ou un bouton doit exister ici en cible.

### role_permissions
Rôle : association rôle-permission. Colonnes : role_id FK, permission_id FK, PK composite. Règles : tout changement est audité.

### users
Rôle : comptes d'accès. Colonnes : id, email unique, display_name, status, role_id transitoire, created_at, updated_at. Contraintes : statut actif/inactif/suspendu/archivé. Relations : profils, audits, commandes. Règles : suppression logique, blocage, déblocage, sécurité appareil.

### beneficiaries, services, subscriptions, payments, invoices, audit_logs
Rôle : socle MVP conservé. Ces tables restent compatibles mais doivent évoluer vers service_definitions, orders, wallets et audit durable. Les paiements directs sont transitoires ; la cible impose wallet et moteur universel.

## Dictionnaire détaillé des tables cibles

Catalogues : catalogs, catalog_items, networks, providers, service_definitions, service_modes, price_rules, commission_rules. Rôle : configurer les services, prix, modes, fournisseurs, réseaux et commissions sans code. Contraintes : codes uniques, statuts, périodes de validité, métadonnées JSON, audit.

Wallets : wallets, wallet_balances, wallet_transactions. Rôle : gérer solde disponible/réservé par devise, mouvements numériques, commissions, corrections, réservations et rollback. Contraintes : solde non négatif, devise active, type de transaction contrôlé, idempotence cible.

Commandes : orders, order_items, order_steps, order_attempts, order_history. Rôle : moteur universel. Contraintes : cycle incluant payment, statuts contrôlés, historique append-only, tentatives refusées conservées.

Notifications, receipts, connectors, connector_bindings : rôle : notification, preuve de transaction et intégrations techniques indépendantes. Contraintes : statut, liens entité, configuration protégée.

## Futures tables obligatoires détaillées

Messagerie : conversations, conversation_participants, messages, message_receipts, message_media, groups, communities, announcements, statuses, polls, meetings. Relations : users, rôles, médias. Règles : visibilité par rôle, mode privé, audit accès Super Admin.

QR et codes : qr_codes, withdrawal_codes, temporary_pins. Règles : type, expiration, usage unique, statut, bénéficiaire affiché, anti-rejeu, audit.

Sécurité : device_fingerprints, login_attempts, login_sessions, security_events, two_factor_settings. Règles : blocage 4 tentatives, délai 24 h par défaut, révocation appareil, 2FA configurable.

Marketplace : accessory_products, central_stock_movements, agent_stock_items, agent_shop_products, accessory_orders, deliveries. Règles : Hope House fournisseur officiel, stock central, stock Agent, prix achat, prix vente, bénéfice.

Engagement : loyalty_accounts, loyalty_transactions, referral_codes, referral_rewards, promotions, bonus_rules. Règles : calcul configurable, expiration, anti-fraude, audit.

## Tables Authentification & Sécurité — Lot 1 contractuel

Le Lot 1 ajoute au schéma conceptuel les tables nécessaires à l'authentification et à la sécurité, sans migration de production ni client Prisma runtime. PostgreSQL reste la cible; Prisma ORM sera introduit progressivement dans un lot ultérieur avec migrations versionnées compatibles expand/contract.

### app_settings

`app_settings` est la source unique des paramètres configurables, y compris les politiques de sécurité. Elle évite la création d'une table `security_policies` séparée. Les paramètres sont identifiés par namespace, clé, scope, statut, période de validité, valeur JSONB, auteur de création/modification et métadonnées JSONB. Le contrat PostgreSQL impose `scope_type = global` avec `scope_id IS NULL` pour les paramètres globaux, `scope_id IS NOT NULL` pour les scopes non globaux, et un index unique `NULLS NOT DISTINCT` sur `(namespace, key, scope_type, scope_id, status)` afin de garantir l'unicité logique des configurations globales malgré la sémantique PostgreSQL des valeurs NULL.

### auth_credentials

Stocke les secrets d'authentification sous forme hashée uniquement. Aucun mot de passe, token ou secret ne doit être conservé en clair. Les statuts couvrent actif, désactivé, rotation et archivage.

### device_fingerprints

Journal des appareils par utilisateur. Le fingerprint stocké est une empreinte hashée. Les statuts couvrent pending, trusted, untrusted, revoked et archived.

### login_sessions

Sessions révocables liées à un utilisateur et éventuellement à un appareil. Les sessions possèdent statut, émission, expiration absolue, expiration d'inactivité, dernière activité et informations de révocation.

### session_refresh_tokens

Historique des refresh tokens rotatifs. Seule l'empreinte hashée du token est stockée. Les statuts couvrent active, rotated, revoked, expired et reused afin de détecter les réutilisations suspectes.

### login_attempts

Journal des tentatives de connexion. Il conserve identifiant hashé, utilisateur si connu, appareil si connu, IP hashée si disponible, résultat, motif d'échec, date et métadonnées.

### security_events

Événements sécurité append-only : connexions, échecs, blocages, déblocages, appareils, 2FA, reset, révocations et Login As. Les niveaux de gravité sont info, medium, major et critical.

### password_reset_requests

Demandes de réinitialisation de mot de passe avec token hashé, statut, expiration et date de complétion. Les réponses API restent neutres pour limiter l'énumération de comptes.

### two_factor_settings et two_factor_challenges

`two_factor_settings` décrit les règles 2FA configurables par scope. `two_factor_challenges` journalise les challenges émis, leur méthode, statut, compteur de tentatives, nombre maximal de tentatives, expiration et date de vérification. Le compteur `attempt_count` ne peut jamais être négatif.

### admin_access_logs

Journalise les accès administratifs sensibles, notamment Login As, avec acteur, cible, justification, session liée, début, fin et métadonnées.

### Prisma et Neon PostgreSQL

Prisma ORM est la cible de modélisation et de migrations versionnées. Neon est uniquement un fournisseur PostgreSQL. La logique métier ne dépend jamais de Neon. `database/schema.sql` reste un contrat documentaire aligné, non exécutable comme migration automatique. Toute future migration devra préserver explicitement les contraintes PostgreSQL non représentables directement par Prisma, notamment l'unicité `app_settings` avec `NULLS NOT DISTINCT`, et rester additive, testée avant production et compatible avec une stratégie expand/contract.

### Lecture runtime de configuration

`app_settings` reste la source unique de vérité pour les paramètres configurables. Le `ConfigurationService` lit uniquement des paramètres applicables à l'exécution via `namespace`, `key` et `scope` fournis par le serveur, jamais directement par une requête client comme source d'autorité. Les statuts non actifs, valeurs futures, expirées ou invalides ne deviennent pas des configurations runtime.

Les valeurs sensibles ne doivent pas être exposées dans les logs, erreurs ou réponses API. Ce lot ne crée pas de chiffrement applicatif improvisé, pas de CRUD d'administration, pas de RBAC dynamique et pas de nouvelle table de politiques de sécurité; ces sujets restent réservés à des lots ultérieurs.
