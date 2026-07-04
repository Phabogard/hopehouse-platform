# Écrans détaillés par rôle

## Règle de documentation UI

Chaque écran doit être construit à partir des éléments suivants : objectif, description, menus, cartes, champs, boutons, actions, validations, permissions, notifications, interactions modules et erreurs. Aucun bouton sensible ne peut exister sans permission RBAC et audit si l'action est sensible.

## Client — Tableau de bord

Objectif : présenter l'état personnel du Client. Menus : Wallet, Acheter, Transférer, Retirer, Recevoir, Messages, Notifications, Fidélité, Parrainage, Profil. Cartes : solde par devise, dernières transactions, points, promotions, messages récents, QR permanent. Champs : recherche service, montant rapide, devise. Boutons : Acheter, Scanner QR, Transférer, Retirer, Voir reçu, Contacter Agent. Validations : compte actif, appareil autorisé, devise disponible. Permissions : client:dashboard:read, wallet:self:read. Notifications : sécurité, transaction, message. Interactions : wallet, commandes, QR, messagerie, fidélité. Erreurs : wallet indisponible, session expirée, permission absente.

## Client — Wallet

Objectif : consulter et initier opérations. Menus : Transactions, Dépôt reçu, Retrait, Transfert, Reçus. Cartes : USD, CDF, solde disponible, solde réservé. Champs : montant, devise, destinataire, note. Boutons : Transférer, Retirer, Recevoir, Télécharger reçu, Signaler. Validations : solde suffisant, montant positif, devise active, QR/PIN si requis. Permissions : wallet:self:read, wallet:transfer:create, withdrawal:create. Notifications : succès, échec, solde insuffisant. Interactions : moteur, wallet, QR, audit. Erreurs : solde insuffisant, QR expiré, bénéficiaire invalide.

## Client — Messagerie

Objectif : discuter avec les rôles autorisés. Menus : Agents, Administrateurs, Comptables, Super Admin, Groupes, Archives. Cartes : conversation, statut, non lus. Champs : message, média, recherche. Boutons : Envoyer, Audio, Document, Appel audio, Appel vidéo, Réagir, Archiver. Validations : canal activé, destinataire autorisé. Permissions : messaging:self:create. Interactions : notifications, audit accès admin. Erreurs : canal désactivé, média trop lourd, destinataire non autorisé.

## Agent — Dashboard

Objectif : piloter ventes, recharges, retraits et boutique. Menus : Wallet, Clients, Recharge, Retrait, Vente, Marketplace, Stock, Boutique, Commissions, Messages, Rapports. Cartes : solde, commissions, ventes, stock faible, commandes en attente. Boutons : Scanner QR, Recharger client, Confirmer retrait, Acheter stock, Modifier prix. Permissions : agent:dashboard:read, wallet:agent:read. Erreurs : solde insuffisant, client non associé, stock insuffisant.

## Agent — Marketplace et stock

Objectif : acheter accessoires Hope House et gérer stock Agent. Menus : Catalogue, Panier, Stock Agent, Boutique. Champs : quantité, prix de vente Agent, description boutique. Boutons : Acheter avec wallet, Publier, Modifier prix, Désactiver article. Validations : Agent actif, wallet suffisant, stock central disponible, prix vente >= règles minimales si configurées. Interactions : wallet, stock central, stock agent, boutique, audit. Erreurs : stock central insuffisant, wallet insuffisant, prix invalide.

## Administrateur — Modules délégués

Objectif : gérer uniquement le périmètre autorisé. Menus : Commandes, Catalogues délégués, Incidents, Conversations autorisées, Rapports. Boutons : Valider, Rejeter, Activer, Désactiver, Assigner, Exporter. Permissions : selon module. Validations : périmètre, rôle, statut. Erreurs : permission absente, conversation privée masquée, action hors périmètre.

## Comptable — Finances

Objectif : suivre finances, exports et rapprochements. Menus : Transactions, Wallets, Commissions, Remboursements, Corrections, Exports. Champs : période, devise, type transaction, statut. Boutons : Filtrer, Exporter, Rapprocher, Demander correction, Télécharger reçu. Permissions : finance:read, accounting:export. Erreurs : export refusé, période invalide, correction non autorisée.

## Auditeur — Audit

Objectif : consulter traces en lecture seule. Menus : Audit, Historique commandes, Sécurité, Login As, Conversations consultées, Exports. Boutons : Rechercher, Filtrer, Ouvrir preuve, Exporter lecture seule, Signaler anomalie. Permissions : audit:read. Erreurs : tentative écriture, filtre invalide, preuve absente.

## Super Admin — Console globale

Objectif : administrer toute la plateforme. Menus : Utilisateurs, Rôles, Permissions, Catalogues, Wallets, Transactions, Marketplace, Stocks, Connecteurs, Conversations, Sécurité, Statistiques, Paramètres. Cartes : volumes par devise, fraude potentielle, stocks, connecteurs, audits critiques, conversations signalées. Boutons : Créer, Modifier, Supprimer logiquement, Activer, Désactiver, Bloquer, Débloquer, Réinitialiser, Login As, Corriger transaction, Annuler exceptionnellement, Exporter. Validations : 2FA si critique, justification obligatoire, permission super_admin configurée. Notifications : action sensible enregistrée. Erreurs : justification absente, 2FA échouée, action irréversible hors délai.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.
