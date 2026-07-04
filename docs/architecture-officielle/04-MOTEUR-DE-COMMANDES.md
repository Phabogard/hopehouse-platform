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

