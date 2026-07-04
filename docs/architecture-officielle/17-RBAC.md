# RBAC configurable

## Rôles de référence

Super Admin, Administrateur, Agent, Client, Comptable et Auditeur sont des rôles initiaux configurables. Ils ne sont pas des contraintes définitives codées dans l'application.

## Permissions

Les permissions couvrent utilisateurs, rôles, permissions, catalogues, services, accessoires, wallets, dépôts, retraits, transferts, commissions, commandes, validations, connecteurs, notifications, reçus, QR Codes, messagerie, statistiques, exports, sécurité et audit.

## Matrice minimale

Client : ses données et opérations autorisées. Agent : ses clients, ventes, retraits, dépôts, commissions, stock. Administrateur : modules délégués. Comptable : finances et exports. Auditeur : lecture seule. Super Admin : toutes permissions initiales, configurables et auditées.

## Écrans et boutons

Chaque bouton sensible doit être lié à une permission : créer, modifier, supprimer logiquement, activer, désactiver, bloquer, débloquer, confirmer, corriger, exporter, Login As, consulter conversation, gérer connecteur.

## Erreurs

Permission absente = refus 403, message clair, aucun effet métier, audit si action sensible.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.

