# Connecteurs

## Principe

Un connecteur est un adaptateur technique. Il ne contient jamais de logique métier, tarifaire, commission, éligibilité ou wallet. Ces décisions appartiennent au moteur et à la configuration.

## Cycle

Créer configuration, activer, désactiver, tester, lier à fournisseur/réseau/service, exécuter, journaliser, remplacer. Les secrets sont protégés et jamais exposés dans les logs.

## Contrats

Chaque connecteur définit capacités, entrées, sorties, erreurs, délais, retries, idempotence, statuts, sandbox si disponible et health check.

## Modes

Manuel sans connecteur. Semi-automatique avec connecteur optionnel. Automatique avec connecteur actif obligatoire.

## Audit

Activation, désactivation, remplacement, échec, succès, changement secret/configuration et appel critique sont audités.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.

