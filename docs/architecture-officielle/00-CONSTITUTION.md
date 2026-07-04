# Constitution officielle — Hope House Platform

## Objet

La Constitution est la norme supérieure de Hope House Platform. Elle fixe les principes qui gouvernent l'ensemble des documents, du schéma SQL, d'OpenAPI, des tests, du code et des décisions de fusion.

## Hiérarchie des sources

1. Constitution officielle.
2. Vision globale officielle.
3. Règles métier officielles.
4. Architecture générale.
5. Documents de modules.
6. Diagrammes.
7. Schéma SQL et OpenAPI.
8. Tests.
9. Code applicatif.

En cas de contradiction, la source inférieure doit être corrigée. Le code actuel peut être transitoire, mais aucune nouvelle fonctionnalité ne peut aggraver un écart avec cette Constitution.

## Interdictions absolues

- Ajouter une fonctionnalité qui contourne le moteur universel de commandes.
- Ajouter une opération financière hors wallet.
- Enregistrer les espèces comme solde applicatif.
- Appeler un fournisseur directement depuis un module métier.
- Coder en dur un service, fournisseur, réseau, forfait, accessoire, prix, commission, rôle, permission ou connecteur.
- Fusionner une Pull Request dont la documentation, les tests ou la sécurité sont incomplets.

## Conditions de fusion

Toute Pull Request doit fournir : analyse de conformité, impacts RBAC, impacts wallet, impacts audit, impacts sécurité, tests verts, documentation mise à jour, absence de régression et justification des écarts transitoires.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

