# Espace Agent

## Responsabilités

L'Agent vend les services, recharge les clients, effectue retraits, achète accessoires Hope House, gère sa boutique Agent, consulte commissions, wallet, clients, QR Code, scanner, messagerie et rapports.

## Limites

L'Agent ne voit que ses propres clients, transactions, commissions et conversations autorisées. Il ne gère pas les rôles globaux, catalogues globaux, connecteurs, paramètres globaux ou audits globaux.

## Permissions

Vendre, déposer vers Client, retrait Client → Agent, acheter accessoires avec wallet, configurer prix de vente de sa boutique dans les limites autorisées, scanner QR, confirmer opérations, consulter rapports Agent et discuter avec ses clients.

## Écrans

Tableau de bord Agent, Wallet, Recharge Client, Retrait Client, Vente service, Scanner, Clients, Commissions, Marketplace accessoires, Stock Agent, Boutique Agent, Commandes, Messages, Rapports, Historique, Paramètres.

## Boutons

Recharger, Retirer, Vendre, Scanner QR, Confirmer, Refuser, Acheter stock, Modifier prix, Publier accessoire, Mettre en pause, Télécharger rapport, Contacter client.

## Statistiques

Ventes, dépôts, retraits, commissions gagnées, stock disponible, bénéfice accessoires, clients actifs, commandes en attente, erreurs et taux de réussite.

## Règles de commission

Aucune commission pour recharge de son propre wallet. Aucune commission pour dépôt Agent → Agent. Les commissions de retrait Client → Agent et ventes sont calculées selon règles configurées.

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

