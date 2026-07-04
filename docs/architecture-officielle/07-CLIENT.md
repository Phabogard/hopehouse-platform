# Espace Client

## Responsabilités

Le Client utilise les services, possède un wallet, consulte son historique, reçoit notifications et reçus, échange via messagerie, utilise QR Code/scanner, fidélité, parrainage, promotions, paramètres, profil et sécurité.

## Limites

Le Client ne gère pas catalogues, rôles, permissions, connecteurs, wallets tiers, audits globaux ou conversations d'autres utilisateurs. Il ne peut débiter que ses fonds disponibles et uniquement selon limites configurées.

## Permissions

Créer/mettre à jour son profil, consulter son wallet, initier achat, transfert, retrait, paiement, consulter reçus, scanner QR, générer QR transactionnel, discuter selon options activées, consulter points, utiliser parrainage et gérer sécurité personnelle.

## Écrans

Tableau de bord, Wallet, Acheter, Transférer, Retirer, Recevoir, Scanner, QR Code, Messages, Notifications, Historique, Reçus, Promotions, Fidélité, Parrainage, Profil, Paramètres, Sécurité, Aide.

## Boutons

Acheter, Envoyer, Retirer, Recevoir, Scanner, Confirmer, Annuler, Télécharger reçu, Partager QR, Copier code, Discuter, Archiver, Signaler, Activer 2FA, Déconnecter appareil.

## Statistiques

Solde par devise, dépenses, retraits, dépôts reçus, transferts, points fidélité, récompenses, parrainages, promotions utilisées et conversations récentes.

## Actions possibles

Acheter un service configuré, payer par QR, transférer, demander retrait, recevoir dépôt, discuter avec Agent/Administrateur/Comptable/Super Admin si activé, consulter historique, gérer profil et sécurité.

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

