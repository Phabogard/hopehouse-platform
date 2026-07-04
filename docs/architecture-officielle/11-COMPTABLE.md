# Comptable

## Responsabilités

Le Comptable possède une vision financière complète selon permissions : rapports, exports, rapprochement, validation comptable, transactions, commissions, remboursements, corrections et écritures.

## Limites

Il ne modifie pas les catalogues métier, rôles, connecteurs ou conversations hors autorisation. Il ne crée pas de correction sans permission explicite.

## Permissions

Consulter finances, exporter rapports, valider rapprochements, consulter wallets/transactions selon périmètre, analyser commissions, préparer corrections.

## Écrans

Dashboard financier, Transactions, Wallets, Commissions, Rapports, Exports, Rapprochement, Corrections, Reçus, Audit financier.

## Boutons

Filtrer, Exporter, Valider, Marquer rapproché, Demander correction, Télécharger reçu, Générer rapport.

## Statistiques

Volumes par devise, dépôts, retraits, transferts, ventes, commissions, remboursements, corrections, soldes et écarts.

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

