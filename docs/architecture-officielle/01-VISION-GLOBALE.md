# Vision globale officielle

Hope House Platform est une plateforme universelle de services numériques. Elle ne dépend d'aucun fournisseur, réseau ou service. Elle doit fonctionner plusieurs années et permettre l'ajout d'un nouveau service par configuration, sans modification du code.

## Périmètre configurable

Sont administrables : services, réseaux, fournisseurs, forfaits, unités, accessoires, tarifs, promotions, commissions, fidélité, parrainage, bonus, devises, connecteurs, permissions, rôles, notifications, reçus, QR Codes, paramètres globaux et règles de sécurité.

## Cycle universel

Tous les services suivent strictement : création, validation, paiement, exécution, notification, reçu, historique, audit. Aucune exception fonctionnelle n'est autorisée.

## Socle existant

Le socle MVP actuel reste conservé pour compatibilité : utilisateurs, bénéficiaires, services, abonnements, paiements, factures, audit et RBAC. Il est transitoire et doit évoluer vers le moteur universel, les wallets et la configuration complète.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

