# Guide d'onboarding par rôle

## Statut normatif

Ce document verrouille le contrat documentaire d'onboarding des comptes pendant la phase transitoire RBAC statique. Il ne crée ni interface, ni migration, ni RBAC dynamique en base.

## Contrat des rôles

| Identifiant technique transitoire | Nom métier officiel | Statut |
|---|---|---|
| `system_admin` | Super Admin | Officiel |
| `business_admin` | Administrateur | Officiel |
| `operations_agent` | Agent | Officiel |
| `client` | Client | Officiel |
| `accountant` | Comptable | Officiel |
| `auditor` | Auditeur | Officiel |
| `finance_manager` | — | Historique/transitoire conservé tant qu'il reste référencé par la matrice technique de design |

Le rôle effectif d'une requête authentifiée provient exclusivement du contexte serveur authentifié. Les champs HTTP tels que `role`, `requesterActorId`, `actorId`, `metadata.role` ou toute préférence utilisateur ne peuvent pas augmenter les permissions.

## Règles communes non négociables

- Les bénéficiaires sans compte restent des `Beneficiary` et ne deviennent pas automatiquement des `User`.
- Les parcours QR, code et PIN identifient ou valident une action documentée, mais ne créent pas une session Client authentifiée sans règle explicite.
- Les préférences personnelles sont limitées à l'affichage, aux notifications et aux paramètres de confort autorisés.
- Un utilisateur ne peut jamais désactiver une protection obligatoire : RBAC serveur, audit obligatoire, blocage sécurité, limites configurées, révocation administrative, 2FA imposée par politique ou contrôle anti-rejeu.
- La création ou l'attribution d'un rôle privilégié est contrôlée côté serveur et auditée avec acteur, cible, avant/après, motif si sensible et horodatage.

## Super Admin (`system_admin`)

- **Création du compte** : bootstrap sécurisé ou création par un Super Admin existant.
- **Créateur autorisé** : mécanisme serveur de bootstrap ou Super Admin avec permission `users:manage` / `roles:manage`.
- **Informations obligatoires** : identifiant unique, nom affiché, statut, rôle technique, secret initial conforme à la politique.
- **Informations optionnelles** : téléphone, préférences d'affichage, langue, métadonnées administratives non sensibles.
- **Sécurité obligatoire** : audit complet, révocation possible, blocage/déblocage contrôlé, justification pour actions sensibles.
- **2FA** : obligatoire si imposée par politique ; non désactivable par préférence utilisateur.
- **Permissions initiales** : matrice RBAC statique du rôle `system_admin`.
- **Première connexion** : authentification serveur, rotation du secret si imposée, enrôlement 2FA selon politique.
- **Actions autorisées** : administration utilisateurs, rôles, permissions, sécurité et audit dans les permissions attribuées.
- **Actions interdites** : contournement d'audit, désactivation de protections obligatoires, opération financière hors moteur dédié.
- **Paramètres configurables** : profil, affichage, notifications et sécurité personnelle dans les limites de politique.
- **Paramètres jamais désactivables** : audit, RBAC serveur, 2FA obligatoire, limites de sécurité, révocation administrative.
- **Blocage/déblocage** : par Super Admin autorisé, avec audit.
- **Changement de rôle** : contrôlé côté serveur, permission `roles:manage`, audit avant/après.
- **Audit** : obligatoire pour toute action administrative ou sensible.
- **Erreurs attendues** : 401 sans authentification, 403 sans permission, 422 données invalides.

## Administrateur (`business_admin`)

- **Création du compte** : par Super Admin.
- **Créateur autorisé** : Super Admin uniquement pour attribution initiale privilégiée.
- **Informations obligatoires** : email, nom affiché, rôle `business_admin`, statut.
- **Informations optionnelles** : téléphone, équipe, préférences personnelles autorisées.
- **Sécurité obligatoire** : RBAC serveur et audit des actions sensibles.
- **2FA** : selon politique, non désactivable si imposée.
- **Permissions initiales** : matrice RBAC statique du rôle `business_admin`.
- **Première connexion** : validation du secret, éventuelle rotation, application de la politique 2FA.
- **Actions autorisées** : supervision métier dans les permissions attribuées.
- **Actions interdites** : gestion des rôles/permissions, auto-élévation, désactivation des protections.
- **Paramètres configurables** : profil, notification, langue.
- **Paramètres jamais désactivables** : contrôles RBAC, audit, 2FA imposée, blocage sécurité.
- **Blocage/déblocage** : par Super Admin autorisé.
- **Changement de rôle** : par Super Admin avec audit.
- **Audit** : actions sensibles historisées.
- **Erreurs attendues** : 403 si permission absente, notamment `roles:manage`.

## Agent (`operations_agent`)

- **Création du compte** : par Super Admin.
- **Créateur autorisé** : Super Admin pour attribution du rôle interne.
- **Informations obligatoires** : email, nom affiché, rôle `operations_agent`, statut.
- **Informations optionnelles** : zone, équipe, téléphone, préférences personnelles.
- **Sécurité obligatoire** : RBAC serveur, limites opérationnelles, audit sensible.
- **2FA** : selon politique, non désactivable si imposée.
- **Permissions initiales** : matrice RBAC statique du rôle `operations_agent`.
- **Première connexion** : authentification et application de la politique sécurité.
- **Actions autorisées** : gestion opérationnelle attribuée.
- **Actions interdites** : gestion utilisateurs privilégiée, rôles/permissions, validation financière non attribuée.
- **Paramètres configurables** : profil et préférences non sécuritaires.
- **Paramètres jamais désactivables** : RBAC, audit, limites, 2FA obligatoire.
- **Blocage/déblocage** : par Super Admin autorisé.
- **Changement de rôle** : par Super Admin avec audit.
- **Audit** : créations et opérations sensibles.
- **Erreurs attendues** : 403 sur permissions absentes.

## Client (`client`)

- **Création du compte** : auto-inscription Client ou création assistée contrôlée côté serveur.
- **Créateur autorisé** : le Client pour son propre compte Client uniquement, ou un acteur interne autorisé sans élévation implicite.
- **Informations obligatoires** : identifiant unique, nom affiché, secret conforme, acceptation des exigences de sécurité applicables.
- **Informations optionnelles** : téléphone, préférences d'affichage et notifications.
- **Sécurité obligatoire** : rôle serveur forcé à `client`, aucune auto-élévation via body HTTP ou metadata.
- **2FA** : selon politique, non désactivable si imposée.
- **Permissions initiales** : droits Client uniquement ; aucune permission administrative dans la matrice statique actuelle.
- **Première connexion** : session authentifiée Client, contrôles de statut et politique sécurité.
- **Actions autorisées** : actions Client documentées dans son périmètre.
- **Actions interdites** : choisir Super Admin, Administrateur, Agent, Comptable ou Auditeur ; gérer rôles/permissions ; accéder aux audits globaux.
- **Paramètres configurables** : profil, langue, notification, confort d'interface.
- **Paramètres jamais désactivables** : RBAC, audit sensible, 2FA imposée, limites, anti-rejeu, blocage sécurité.
- **Blocage/déblocage** : par acteur interne autorisé ; le Client ne peut pas s'auto-débloquer contre la politique.
- **Changement de rôle** : jamais par auto-service ; uniquement mécanisme serveur autorisé et audité.
- **Audit** : tentatives sensibles et changements de sécurité.
- **Erreurs attendues** : 403 pour permission absente, 422 données invalides, refus d'auto-élévation.

## Comptable (`accountant`)

- **Création du compte** : par Super Admin.
- **Créateur autorisé** : Super Admin.
- **Informations obligatoires** : email, nom affiché, rôle `accountant`, statut.
- **Informations optionnelles** : service comptable, téléphone, préférences.
- **Sécurité obligatoire** : RBAC serveur et audit des exports.
- **2FA** : selon politique, non désactivable si imposée.
- **Permissions initiales** : matrice RBAC statique du rôle `accountant`.
- **Première connexion** : authentification et politique sécurité.
- **Actions autorisées** : consultation paiements/factures et export comptable attribué.
- **Actions interdites** : gérer rôles/permissions, valider paiements si non attribué, modifier sécurité obligatoire.
- **Paramètres configurables** : profil et préférences non sécuritaires.
- **Paramètres jamais désactivables** : RBAC, audit, 2FA imposée, limites.
- **Blocage/déblocage** : par Super Admin autorisé.
- **Changement de rôle** : par Super Admin avec audit.
- **Audit** : exports et actions sensibles.
- **Erreurs attendues** : 403 sur permissions absentes.

## Auditeur (`auditor`)

- **Création du compte** : par Super Admin.
- **Créateur autorisé** : Super Admin.
- **Informations obligatoires** : email, nom affiché, rôle `auditor`, statut.
- **Informations optionnelles** : organisation, période de mission, préférences.
- **Sécurité obligatoire** : lecture seule, RBAC serveur, audit de consultation sensible.
- **2FA** : selon politique, non désactivable si imposée.
- **Permissions initiales** : matrice RBAC statique du rôle `auditor`.
- **Première connexion** : authentification, contrôle statut, politique 2FA.
- **Actions autorisées** : consultation audit attribuée.
- **Actions interdites** : création, modification, suppression, gestion rôles/permissions, opérations financières.
- **Paramètres configurables** : profil et préférences non sécuritaires.
- **Paramètres jamais désactivables** : lecture seule, audit, RBAC, 2FA imposée.
- **Blocage/déblocage** : par Super Admin autorisé.
- **Changement de rôle** : par Super Admin avec audit.
- **Audit** : consultations et accès sensibles selon politique.
- **Erreurs attendues** : 403 sur toute écriture ou permission absente.
