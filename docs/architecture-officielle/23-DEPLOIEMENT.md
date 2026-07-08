# Déploiement

Docker, Node.js, PostgreSQL, migrations versionnées, variables d'environnement sécurisées, sauvegardes, restauration, logs, monitoring, health checks, rollback et séparation environnements sont obligatoires.

Les secrets connecteurs/JWT/2FA ne sont jamais versionnés. Les migrations sont testées avant production.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.


## Persistance cible Prisma et Neon PostgreSQL

PostgreSQL reste la cible de persistance. Prisma ORM sera introduit progressivement pour le modèle et les migrations versionnées. Neon PostgreSQL peut être utilisé comme fournisseur PostgreSQL, mais la logique métier ne dépend jamais de Neon. Les chaînes de connexion, secrets JWT, secrets 2FA, secrets connecteurs et paramètres sensibles ne sont jamais versionnés.

Les migrations devront suivre une stratégie compatible expand/contract : ajouts non destructifs, backfill contrôlé, contraintes en deux temps lorsque nécessaire, tests avant production, sauvegarde et plan de rollback.
