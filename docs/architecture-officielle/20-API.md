# API

## Principes

REST documenté par OpenAPI. WebSocket pour temps réel. JWT et RBAC pour toute route protégée. Réponses enveloppées. Erreurs normalisées avec code, message, détails optionnels et identifiant de trace.

## Routes actuelles MVP

/health, /users, /beneficiaries, /services, /subscriptions, /payments, /invoices et /audit-logs existent. Elles sont transitoires et doivent être alignées progressivement sur authentification réelle, persistence, RBAC configurable et moteur universel.

## Routes futures obligatoires

/orders, /wallets, /wallet-transactions, /catalogs, /catalog-items, /connectors, /notifications, /receipts, /qr-codes, /messages, /conversations, /marketplace/accessories, /agent-shop, /loyalty, /referrals, /promotions, /security/devices, /security/login-attempts, /admin/login-as et /reports.

## Validation

Chaque route valide schéma, type, devise, montant, statut, permission, identité, appareil si activé, idempotence et impacts wallet/audit.

## Erreurs

400 requête invalide, 401 non authentifié, 403 permission absente, 404 ressource absente, 409 conflit, 422 règle métier, 429 limitation, 500 erreur interne.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.


## Endpoints actuels documentés

GET /health : public, contrôle disponibilité, réponse { data: { status, service } }, erreurs 500.
GET /users : cible JWT + users:read, liste utilisateurs, erreurs 401/403/500.
GET/POST /beneficiaries : JWT, beneficiaries:read/manage, corps création reference/displayName, erreurs 401/403/422/500.
GET /services : JWT, services:read, liste services transitoires, cible catalogues.
GET /subscriptions : JWT, subscriptions:read, liste abonnements.
GET/POST /payments : transitoire. La cible remplace la création directe par /orders + wallet. Erreurs 401/403/422/500.
GET /invoices : JWT, invoices:read.
GET /audit-logs : JWT, audit:read, pagination cible obligatoire.

## Futures API détaillées

POST /orders : crée commande universelle. Permissions selon service. Corps : serviceDefinitionId, beneficiaryId, amount, currency, metadata, idempotencyKey. Réponse : order, steps, payment reservation. Erreurs : service inactive, solde insuffisant, permission absente.

POST /wallets/{id}/deposit, /withdraw, /transfer, /refund, /correction : opérations wallet. Auth JWT, RBAC, 2FA pour correction, solde vérifié, reçu et QR transactionnel retournés.

GET/POST /catalogs et /catalog-items : administration configurable. Permissions catalog:read/manage. Erreurs : code dupliqué, statut invalide, impact non confirmé.

POST /marketplace/accessories/orders : Agent achète auprès de Hope House avec wallet. Réponse : commande, stock central mis à jour, stock Agent augmenté, reçu. Erreurs : stock insuffisant, wallet insuffisant.

GET/PATCH /agent-shop/products : Agent configure sa boutique, prix de vente et disponibilité. Permissions agent_shop:manage.

POST /qr-codes/scan et /qr-codes/transactional : validation QR, affichage nom, type, montant, expiration, usage unique. Erreurs : QR expiré, mauvais type, déjà utilisé.

GET/POST /conversations et /messages : messagerie temps réel. Permissions selon canal activé. Erreurs : destinataire non autorisé, mode privé, média invalide.

GET /reports, /reports/finance, /reports/fraud : statistiques et détection fraude. Permissions comptable, auditeur ou Super Admin.

## Contrat Authentification & Sécurité — Lot 1

OpenAPI reste en version 3.1.0. Le contrat API évolue à `info.version: 0.2.0` pour documenter les ressources Authentification & Sécurité avant implémentation. Les endpoints du Lot 1 sont contractuels et documentaires; aucun code métier n'est ajouté dans ce lot.

### Endpoints Authentification

- POST /auth/login : démarre une authentification configurable.
- POST /auth/refresh : rafraîchit une session avec rotation obligatoire du refresh token.
- POST /auth/logout : révoque la session courante.
- POST /auth/password-reset/request : demande une réinitialisation de mot de passe avec réponse neutre.
- POST /auth/password-reset/confirm : confirme une réinitialisation avec token stocké uniquement sous forme d'empreinte hashée.
- POST /auth/2fa/challenges/{challengeId}/verify : vérifie un challenge 2FA configurable.
- GET /auth/sessions : liste les sessions de l'utilisateur courant.
- DELETE /auth/sessions : révocation globale des sessions de l'utilisateur courant.
- DELETE /auth/sessions/{sessionId} : révocation d'une session spécifique.

### Endpoints Sécurité

- GET /security/devices : liste les appareils.
- PATCH /security/devices/{deviceId} : met à jour les métadonnées configurables d'un appareil.
- DELETE /security/devices/{deviceId} : révoque un appareil et les sessions liées selon politique configurable.
- GET /security/events : liste les événements sécurité consultables.

### Endpoints Administration Sécurité

- GET /admin/security/login-attempts : consulte les tentatives de connexion selon permissions configurables.
- GET /admin/security/sessions : consulte les sessions selon permissions configurables.
- POST /admin/security/users/{userId}/unlock : débloque un utilisateur selon règle configurée.
- POST /admin/security/users/{userId}/revoke-sessions : révoque les sessions d'un utilisateur avec justification.
- POST /admin/security/users/{userId}/revoke-devices : révoque les appareils d'un utilisateur avec justification.
- POST /admin/login-as : démarre une session Login As avec justification, 2FA configurable et audit complet.
- DELETE /admin/login-as/{sessionId} : termine une session Login As.

### Refresh tokens

Les refresh tokens sont rotatifs, stockés côté serveur uniquement sous forme d'empreinte hashée, révocables globalement et révocables par appareil. Les durées par défaut sont documentées comme paramètres `app_settings`, pas comme constantes de code.

### Versionnement

OpenAPI conserve la spécification 3.1.0. `info.version` suit l'évolution du contrat. Le Lot 1 porte la version à 0.2.0 sans introduire de rupture des routes MVP existantes.
