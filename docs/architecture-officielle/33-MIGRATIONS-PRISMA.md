# Migrations Prisma — Contrat officiel

## Statut normatif

Ce document définit le contrat de versionnement PostgreSQL de Hope House Platform. La première migration Prisma versionnée existe désormais et a été validée sur une branche PostgreSQL Neon temporaire avant application sur la branche `production`.

## Source canonique

PostgreSQL est la cible de persistance. `prisma/schema.prisma` est le modèle ORM de référence. `database/schema.sql` reste le contrat SQL documentaire et doit rester sémantiquement équivalent au modèle Prisma, tout en explicitant les contraintes PostgreSQL que Prisma ne représente pas nativement.

La migration versionnée correspondante est :

`prisma/migrations/20260816133000_initial_postgresql_contract/migration.sql`

Le verrou de fournisseur est :

`prisma/migrations/migration_lock.toml`

## État actuel

Le schéma Prisma Auth/Security est maintenant versionné dans une première migration PostgreSQL. La migration a été exécutée sur une branche Neon temporaire, inspectée, puis appliquée sur la branche Neon `production` parce que cette base était vierge de tables applicatives.

La branche Neon `phase-2-4-test` reste conservée comme environnement de test séparé.

La migration n'est pas une autorisation de supprimer les branches Neon ni de lancer des opérations destructives.

## Contraintes PostgreSQL obligatoires

### app_settings

La contrainte d'identité doit être portée par PostgreSQL :

```sql
CREATE UNIQUE INDEX app_settings_unique_identity
ON app_settings (namespace, key, scope_type, scope_id, status)
NULLS NOT DISTINCT;
```

Le contrat impose également :

```sql
CHECK (
  (scope_type = 'global' AND scope_id IS NULL)
  OR
  (scope_type <> 'global' AND scope_id IS NOT NULL)
)
```

Cette protection ne doit pas être remplacée par une simple unicité Prisma.

### two_factor_challenges

La table conserve `attempt_count`, `max_attempts`, `verified_at`, avec :

```sql
CHECK (attempt_count >= 0)
CHECK (max_attempts > 0)
```

### Dates et JSON

Les champs temporels Prisma persistés utilisent explicitement `@db.Timestamptz(3)` afin de rester alignés sur `TIMESTAMPTZ(3)` PostgreSQL. Les valeurs structurées utilisent `JSONB`.

## Validation réalisée

La migration a été testée sur une branche Neon temporaire avant application :

1. Les 13 tables Prisma attendues ont été créées.
2. L'index `app_settings_unique_identity` a été vérifié avec `NULLS NOT DISTINCT`.
3. Les CHECK `app_settings.scope_type/scope_id` ont été vérifiés.
4. Les CHECK `two_factor_challenges.attempt_count` et `max_attempts` ont été vérifiés.
5. Les colonnes temporelles ont été vérifiées en `timestamptz`.
6. La migration temporaire a été supprimée après validation.
7. La même migration a ensuite été appliquée à Neon `production`.

## Historique Prisma

Le fichier de migration est versionné dans Git. La base `production` a reçu le SQL exact de cette migration par le mécanisme contrôlé de migration Neon.

La table `_prisma_migrations` doit être initialisée par `prisma migrate resolve --applied 20260816133000_initial_postgresql_contract` depuis un environnement disposant de `DATABASE_URL`, afin que l'historique Prisma reconnaisse que le schéma de production correspond déjà à cette migration. Cette opération de résolution ne doit pas réexécuter le SQL.

Après cette résolution, les déploiements futurs doivent utiliser `prisma migrate deploy` et non `prisma db push`.

## Types de données

Les dates de persistance doivent utiliser les types temporels PostgreSQL correspondants (`TIMESTAMPTZ(3)`), et les valeurs structurées doivent utiliser `JSONB` lorsque le contrat les définit comme JSON. Les représentations `TEXT` historiques de dates ou JSON ne doivent pas être réintroduites dans une nouvelle migration.

## Stratégie pour les prochaines migrations

1. Modifier le modèle Prisma et/ou le contrat SQL documentaire.
2. Générer une migration dans un environnement de développement ou une branche dédiée.
3. Inspecter entièrement le SQL produit.
4. Préserver manuellement toute contrainte PostgreSQL non représentable directement par Prisma.
5. Appliquer la migration sur PostgreSQL de test.
6. Exécuter les tests de cohérence, runtime et intégration concernés.
7. Vérifier `git diff --check`, `npm test`, `npm run build` et `git status --short --branch`.
8. Après validation, déployer avec `prisma migrate deploy` dans les environnements concernés.

## Données existantes et expand/contract

Toute conversion de type sur une base contenant déjà des données doit être traitée comme une opération de données distincte et validée. Les migrations destructives, les suppressions de colonnes non nécessaires, les changements silencieux de sémantique et les modifications de secrets sont interdits sans lot dédié et validation explicite.

## Interdictions

- Aucun `prisma db push` comme mécanisme de migration de production.
- Aucun `prisma migrate dev` sur la base de production.
- Aucune migration destructive dans un lot ordinaire.
- Aucun secret, `.env`, JWT secret ou credential dans Git.
- Aucun CRUD admin de `app_settings` dans le lot de migration.
- Aucun RBAC dynamique introduit par une migration.
- Aucun changement Wallet / Order Engine / Payments dans le lot de migration Auth/Security.

## Critère de sortie

Le contrat de préparation est considéré comme établi lorsque le schéma Prisma, le contrat SQL documentaire, la migration versionnée et PostgreSQL de production sont cohérents, avec conservation explicite des contraintes non représentables directement par Prisma. L'étape opérationnelle restante est uniquement la résolution de l'historique `_prisma_migrations` depuis un environnement disposant de `DATABASE_URL`.
