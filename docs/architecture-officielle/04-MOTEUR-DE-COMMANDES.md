# Moteur universel de commandes

## Rôle

Le moteur est le point d'entrée obligatoire de tout service vendable ou opération transactionnelle. Il lit la configuration, contrôle les permissions, orchestre le wallet, déclenche l'exécution, génère reçu, historique et audit.

## Cycle obligatoire

1. Création : sélection service, bénéficiaire, canal, montant, devise, mode, métadonnées.
2. Validation : identité, RBAC, statut service, règles d'éligibilité, QR/PIN si requis, limites, appareil, risque.
3. Paiement : réservation ou débit wallet, refus si solde insuffisant, écriture de tentative.
4. Exécution : manuelle, semi-automatique ou automatique selon configuration.
5. Notification : client, agent, admin, super admin ou rôle configuré.
6. Reçu : numéro, QR transactionnel, statut, livraison.
7. Historique : transitions immuables et lisibles.
8. Audit : action, acteur, contexte, résultat, métadonnées.

## Implémentation actuelle — étape Order Engine

Le premier incrément applicatif du moteur crée un domaine de commande générique, sans connecter encore les wallets, QR Codes, messagerie, notifications externes, reçus matériels, marketplace ou connecteurs. Cette limite est volontaire afin de ne développer qu'un grand module à la fois.

### États officiels

Les états applicatifs du cycle sont strictement ordonnés : `creation`, `validation`, `payment`, `execution`, `notification`, `receipt`, `history`, `audit`. Une commande démarre toujours à `creation` et ne peut avancer que vers l'état suivant. Les transitions arrière, les sauts d'étapes et les transitions après `audit` sont refusés.

### Généricité obligatoire

Une commande référence uniquement une configuration de service (`serviceDefinitionId`), un mode (`manual`, `semi_automatic` ou `automatic`), un acteur demandeur, un bénéficiaire optionnel, un canal optionnel, une intention monétaire optionnelle et des métadonnées. Le moteur ne connaît aucun fournisseur, réseau, commission, catalogue spécifique, produit, wallet, connecteur ou rôle codé en dur. Ces éléments devront être fournis par les futurs modules configurables.

### Services métier

Le service `OrderEngine` orchestre la création et l'avancement séquentiel. Il accepte des handlers optionnels par étape pour que les futurs modules configurables réalisent validation, paiement wallet, exécution, notification, reçu, historique et audit sans modifier la logique du moteur. Si un handler échoue, la transition n'est pas enregistrée.

### Limites volontaires de cette étape

Le paiement est un état orchestrable du cycle. Depuis l'étape Wallet Engine, un handler `payment` peut appeler le Wallet pour réserver ou débiter des fonds sans modifier le moteur de commandes. La notification et le reçu restent uniquement des états orchestrables. La persistance PostgreSQL reste documentaire dans `database/schema.sql` et sera connectée lors d'une étape dédiée.

## Modes

Manuel : un utilisateur autorisé exécute hors système et confirme. Semi-automatique : le système prépare ou assiste, mais une validation humaine reste requise. Automatique : un connecteur actif exécute l'action technique. Le changement de mode est une configuration.

## Erreurs

Solde insuffisant, service inactif, permission absente, QR expiré, PIN invalide, connecteur indisponible, échec validation, expiration, annulation et rollback sont historisés. Les fonds réservés sont libérés ou corrigés selon le statut final.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

