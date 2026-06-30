# hopehouse-platform

Plateforme numérique de gestion des services, paiements et abonnements.

## Statut

Socle MVP initial de Hope House ERP.

## Stack actuelle

- Node.js 20+
- TypeScript
- API HTTP native Node.js
- Tests avec `node:test`

## Commandes

```bash
npm install
npm run build
npm test
npm run dev
```

## Structure

```text
docs/       Documents de conception
database/   Schéma conceptuel SQL initial
src/        API MVP TypeScript modulaire
tests/      Tests automatisés
```

## Principes

- Règles métier conformes au Document n°1.
- RBAC contrôlé côté serveur.
- Audit prévu pour les actions sensibles.
- Suppression physique évitée pour les données critiques.
