# Tests

## Types

Tests domaine, API, cohérence documentaire, RBAC, wallet, moteur, catalogues, connecteurs, sécurité, QR, messagerie, marketplace, migrations, performance critique et non-régression.

## Cohérence documentaire

Les tests doivent vérifier que les concepts obligatoires sont présents : moteur universel, paiement dans le cycle, wallets, dépôt/retrait, espèces non enregistrées, commissions configurables, marketplace accessoires, messagerie, QR, sécurité, RBAC, OpenAPI et SQL.

## Règle de fusion

Tests rouges = pas de fusion. Test manquant sur une règle critique = correction documentaire ou test obligatoire avant fonctionnalité.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.


## Tests de cohérence Authentification & Sécurité — Lot 1

Les tests de cohérence doivent vérifier que le contrat Authentification & Sécurité reste aligné entre OpenAPI, SQL et documentation officielle. Le Lot 1 doit notamment contrôler :

- OpenAPI conserve `openapi: 3.1.0` et porte `info.version` à `0.2.0`.
- OpenAPI documente `/auth/login`, `/auth/refresh`, `/auth/logout`, `/security/devices`, `/security/events` et les endpoints d'administration sécurité.
- OpenAPI documente `ErrorResponse`, `LoginRequest`, `RefreshTokenRequest`, `SessionResponse`, `DeviceResponse`, `SecurityEventResponse` et les schémas 2FA.
- Le schéma SQL contient `app_settings`, `auth_credentials`, `device_fingerprints`, `login_sessions`, `session_refresh_tokens`, `login_attempts`, `security_events`, `password_reset_requests`, `two_factor_settings`, `two_factor_challenges` et `admin_access_logs`.
- Le schéma SQL ne contient pas `CREATE TABLE security_policies`.
- La documentation officielle mentionne les refresh tokens rotatifs, le stockage hashé, la révocation globale, la révocation par appareil et `app_settings` comme source unique des paramètres configurables.
