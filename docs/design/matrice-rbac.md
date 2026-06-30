# Matrice RBAC initiale — Hope House ERP

## Rôles MVP

| Rôle | Description |
|---|---|
| system_admin | Administration technique et gestion des accès élevés |
| business_admin | Supervision métier |
| operations_agent | Gestion opérationnelle courante |
| finance_manager | Supervision financière |
| accountant | Consultation et export comptable |
| auditor | Consultation des traces d'audit |

## Permissions MVP

| Permission | system_admin | business_admin | operations_agent | finance_manager | accountant | auditor |
|---|---:|---:|---:|---:|---:|---:|
| users:read | oui | oui | non | non | non | non |
| users:manage | oui | non | non | non | non | non |
| roles:manage | oui | non | non | non | non | non |
| beneficiaries:read | oui | oui | oui | oui | non | non |
| beneficiaries:manage | non | oui | oui | non | non | non |
| services:read | oui | oui | oui | oui | non | non |
| services:manage | non | oui | non | non | non | non |
| subscriptions:read | oui | oui | oui | oui | non | non |
| subscriptions:manage | non | oui | oui | non | non | non |
| payments:read | oui | oui | oui | oui | oui | non |
| payments:create | non | oui | oui | oui | non | non |
| payments:validate | non | non | non | oui | non | non |
| invoices:read | oui | oui | oui | oui | oui | non |
| invoices:manage | non | non | non | oui | non | non |
| accounting:export | non | non | non | oui | oui | non |
| audit:read | oui | non | non | non | non | oui |

## Règles

- Les permissions sensibles ne sont jamais accordées implicitement.
- Les changements RBAC sont audités.
- Le contrôle d'accès est réalisé côté serveur.
