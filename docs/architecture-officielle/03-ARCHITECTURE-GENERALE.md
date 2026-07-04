# Architecture générale

## Style architectural

L'architecture est modulaire, pilotée par configuration et centrée sur le moteur universel de commandes. Les modules métier ne contiennent pas de logique spécifique à un fournisseur. Les connecteurs exécutent uniquement des actions techniques autorisées par la configuration.

## Couches

1. Interfaces Web/Mobile/Admin.
2. API REST OpenAPI et WebSocket.
3. Authentification JWT et sécurité appareil.
4. RBAC configurable.
5. Moteur universel de commandes.
6. Services applicatifs : wallets, catalogues, messagerie, QR Codes, notifications, reçus, marketplace, fidélité, parrainage.
7. Domaine et règles configurables.
8. Repositories PostgreSQL et migrations.
9. Connecteurs indépendants.
10. Audit, historique, observabilité et rapports.

## Compatibilité

Le code actuel est un MVP in-memory partiel. Les futures évolutions doivent conserver les routes existantes ou les déprécier progressivement, mais les nouvelles capacités métier doivent passer par les composants cibles.

## Technologies

Node.js, TypeScript, PostgreSQL, REST API, OpenAPI, WebSocket, Firebase Cloud Messaging, Docker, GitHub, Vitest et bibliothèques QR Code open source sont les références privilégiées.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

