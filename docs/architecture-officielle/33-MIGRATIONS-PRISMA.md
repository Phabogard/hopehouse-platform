# Migrations Prisma — Contrat de préparation

## Objectif

Ce document définit les conditions nécessaires avant la première migration Prisma versionnée de Hope House Platform. Il ne crée ni n'applique de migration et ne constitue pas une autorisation de modifier une base de production.

## Source canonique

PostgreSQL est la cible de persistance. `prisma/schema.prisma` est le modèle ORM de référence. `database/schema.sql` est le contrat SQL documentaire qui doit rester sémantiquement équivalent au modèle Prisma et expliciter les contraintes PostgreSQL que Prisma ne sait pas représenter nativement.

## État actuel

Le dépôt peut contenir un schéma Prisma cohérent avec le contrat PostgreSQL sans posséder encore de dossier `prisma/migrations`. L'absence de migration est volontaire tant que le contrat de persistance n'a pas été validé sur une base PostgreSQL réelle.

Aucune migration ne doit être générée par `prisma migrate`, et aucun `prisma db push` ne doit être utilisé pour contourner le versionnement, tant que les contrôles ci-dessous ne sont pas satisfaits.

## Contraintes PostgreSQL obligatoires

### app_settings

La contrainte d'identité doit être portée par PostgreSQL :

```sql
CREATE UNIQUE INDEX app_settings_unique_identity
ON app_settings (namespace, key, scope_type, scope_id, status)
NULLS NOT DISTINCT;
```

Le contrat doit également imposer :

```sql
CHECK (
  (scope_type = 'global' AND scope_id IS NULL)
  OR
  (scope_type <> 'global' AND scope_id IS NOT NULL)
)
```

Cette protection ne doit pas être remplacée par une simple unicité Prisma, car Prisma ne représente pas directement `NULLS NOT DISTINCT`.

### two_factor_challenges

La table doit conserver `max_attempts`, `verified_at` et :

```sql
CHECK (attempt_count >= 0)
```

ainsi qu'une borne positive sur `max_attempts`.

### Indexes Auth/Security

Les indexes déclarés dans Prisma et documentés dans `database/schema.sql` doivent être présents dans la migration finale lorsqu'ils sont nécessaires aux parcours de résolution de configuration, expiration, révocation, blocage login et audit.

### users / roles

La relation `users.role_id -> roles.id` doit être représentée dans Prisma et dans la migration PostgreSQL. Aucun nouveau système de RBAC dynamique n'est introduit par cette migration.

## Types de données

Les dates de persistance doivent utiliser les types temporels PostgreSQL correspondants (`TIMESTAMPTZ` dans le contrat SQL), et les valeurs structurées doivent utiliser `JSONB` lorsque le contrat les définit comme JSON. Les représentations `TEXT` historiques de dates ou JSON ne doivent pas être réintroduites dans une nouvelle migration.

## Stratégie de validation avant application

1. Exécuter `prisma validate` avec une `DATABASE_URL` factice de type PostgreSQL si aucune connexion réelle n'est nécessaire.
2. Générer la migration dans une branche dédiée et inspecter entièrement le SQL produit.
3. Vérifier que la migration crée toutes les tables, FK, uniques, checks et indexes attendus.
4. Vérifier manuellement que `NULLS NOT DISTINCT` est présent pour `app_settings`.
5. Vérifier que `two_factor_challenges.max_attempts` et `verified_at` sont créés.
6. Appliquer la migration sur une base PostgreSQL de test vierge.
7. Exécuter les tests de cohérence et les tests runtime.
8. Tester un second scénario avec des données compatibles existantes avant toute migration de production.
9. Vérifier `git diff --check`, `npm test`, `npm run build` et `git status --short --branch`.
10. Seulement après validation, ouvrir une PR de migration ciblée.

## Données existantes et expand/contract

La première migration doit être compatible avec les données déjà persistées. Toute conversion de `TEXT` vers `TIMESTAMPTZ` ou `JSONB` sur une base existante doit être traitée comme une opération de données distincte et validée; elle ne doit pas être déduite automatiquement du schéma documentaire.

Les migrations destructives, les suppressions de colonnes non nécessaires, les changements silencieux de sémantique et les modifications de secrets sont interdits dans ce lot de préparation.

## Interdictions

- Aucun `prisma db push` comme mécanisme de migration.
- Aucune migration appliquée à une base de production depuis cette mission.
- Aucun secret, `.env`, JWT secret ou credential dans Git.
- Aucun CRUD admin de `app_settings`.
- Aucun RBAC dynamique.
- Aucun changement Wallet / Order Engine / Payments.

## Critère de sortie

La mission de préparation est terminée lorsque le schéma Prisma, le contrat PostgreSQL documentaire et le SQL de migration généré sont vérifiés ensemble sur PostgreSQL de test, avec conservation explicite des contraintes non représentables directement par Prisma. L'absence de `prisma/migrations` avant cette validation est normale et intentionnelle.
