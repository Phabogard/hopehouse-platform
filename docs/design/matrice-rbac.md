# Matrice RBAC initiale — Hope House ERP

## Rôles MVP

| Identifiant technique | Nom métier officiel | Description | Statut |
|---|---|---|---|
| system_admin | Super Admin | Administration technique et gestion des accès élevés | Officiel transitoire |
| business_admin | Administrateur | Supervision métier | Officiel transitoire |
| operations_agent | Agent | Gestion opérationnelle courante | Officiel transitoire |
| client | Client | Compte client authentifié limité à son périmètre | Officiel transitoire |
| accountant | Comptable | Consultation et export comptable | Officiel transitoire |
| auditor | Auditeur | Consultation des traces d'audit | Officiel transitoire |
| finance_manager | — | Supervision financière | Historique/transitoire conservé par compatibilité avec la matrice technique actuelle |

## Permissions MVP

| Permission | system_admin | business_admin | operations_agent | client | finance_manager | accountant | auditor |
|---|---:|---:|---:|---:|---:|---:|---:|
| users:read | oui | oui | non | non | non | non | non |
| users:manage | oui | non | non | non | non | non | non |
| roles:manage | oui | non | non | non | non | non | non |
| beneficiaries:read | oui | oui | oui | non | oui | non | non |
| beneficiaries:manage | non | oui | oui | non | non | non | non |
| services:read | oui | oui | oui | non | oui | non | non |
| services:manage | non | oui | non | non | non | non | non |
| subscriptions:read | oui | oui | oui | non | oui | non | non |
| subscriptions:manage | non | oui | oui | non | non | non | non |
| payments:read | oui | oui | oui | non | oui | oui | non |
| payments:create | non | oui | oui | non | oui | non | non |
| payments:validate | non | non | non | non | oui | non | non |
| invoices:read | oui | oui | oui | non | oui | oui | non |
| invoices:manage | non | non | non | non | oui | non | non |
| accounting:export | non | non | non | non | oui | oui | non |
| audit:read | oui | non | non | non | non | non | oui |

## Règles

- Les permissions sensibles ne sont jamais accordées implicitement.
- Les changements RBAC sont audités.
- Le contrôle d'accès est réalisé côté serveur.
- Le rôle effectif provient exclusivement du contexte serveur authentifié, jamais des champs HTTP (`role`, `requesterActorId`, `actorId`, `metadata` ou préférences).
- Le Client ne reçoit aucune permission administrative dans cette matrice statique.
