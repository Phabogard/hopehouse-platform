# Base de données

## Cible

PostgreSQL est la cible. Les migrations futures doivent être versionnées, réversibles lorsque possible, testées et compatibles avec les données existantes.

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
