# Auditeur

## Responsabilités

L'Auditeur contrôle la conformité en lecture seule : audits, historiques, commandes, transactions, sécurité, accès administratifs, Login As, corrections et exports.

## Limites

Aucune modification. Aucune validation opérationnelle. Toute tentative d'écriture est refusée et peut être auditée.

## Permissions

Consulter audits, historiques, rapports, journaux de connexion, événements sécurité, accès conversations administratifs et traces de configuration selon périmètre.

## Écrans

Dashboard audit, Journal d'audit, Historique commandes, Transactions, Sécurité, Login As, Conversations consultées, Exports audit.

## Boutons

Filtrer, Rechercher, Ouvrir détail, Exporter lecture seule, Télécharger preuve, Signaler anomalie.

## Statistiques

Actions sensibles, échecs, corrections, connexions suspectes, consultations administratives, changements RBAC et écarts de conformité.

## Scénarios d'erreur

Permission absente, compte bloqué, wallet insuffisant, QR expiré, PIN invalide, données obligatoires manquantes, service inactif, limite dépassée, tentative de consultation non autorisée et erreur technique doivent produire message clair, absence d'effet partiel non maîtrisé, historique si pertinent et audit si sensible.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

- Moteur universel obligatoire.
- Configuration sans modification du code.
- Wallet numérique obligatoire pour toute opération financière.
- RBAC configurable vérifié côté serveur.
- Audit complet des actions sensibles.

