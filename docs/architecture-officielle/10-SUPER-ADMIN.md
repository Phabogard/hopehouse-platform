# Super Admin

## Responsabilités

Le Super Admin possède le contrôle complet initial de la plateforme via permissions configurables. Il administre utilisateurs, rôles, permissions, catalogues, wallets, connecteurs, modules, statistiques, paramètres, conversations, audits, sécurité et conformité.

## Gestion utilisateurs

Créer utilisateur, modifier profil, supprimer logiquement, bloquer, débloquer, réinitialiser mot de passe, réinitialiser PIN, réinitialiser codes temporaires, révoquer sessions, gérer appareils, imposer 2FA et consulter journaux de connexion.

## Gestion rôles et permissions

Créer, modifier, supprimer logiquement, activer, désactiver rôles et permissions. Attribuer ou retirer rôles. Toute modification est auditée avec avant/après et justification.

## Login As

Le Super Admin peut se connecter comme un utilisateur pour administration/conformité. Exigences : justification obligatoire, bannière de session impersonnée, durée limitée, horodatage, identité Super Admin, identité cible, actions réalisées, périmètre consulté et audit complet.

## Conversations

Le Super Admin peut consulter toute conversation pour administration avec audit obligatoire. Le mode privé peut masquer aux Administrateurs, jamais au Super Admin.

## Wallets et transactions

Voir tous wallets, transactions, réservations, corrections, commissions et reçus. Créditer Agent depuis Super Admin sans commission si autorisé. Corriger uniquement avec justification et audit.

## Catalogues, connecteurs et paramètres

Créer, modifier, activer, désactiver, archiver catalogues, services, fournisseurs, réseaux, accessoires, prix, commissions, promotions, connecteurs, modules et paramètres globaux.

## Écrans

Dashboard global, Utilisateurs, Rôles, Permissions, Wallets, Transactions, Catalogues, Marketplace, Connecteurs, Commandes, Conversations, Audit, Sécurité, Statistiques, Paramètres, Sauvegardes, Journaux.

## Boutons

Créer, Modifier, Supprimer logiquement, Activer, Désactiver, Bloquer, Débloquer, Réinitialiser, Login As, Révoquer, Exporter, Importer, Corriger, Valider, Rejeter, Consulter audit.

## Statistiques globales

Utilisateurs, agents, clients, commandes, volumes wallet par devise, commissions, stock central, ventes accessoires, conversations, incidents, tentatives échouées, connecteurs, audits et performance.

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

