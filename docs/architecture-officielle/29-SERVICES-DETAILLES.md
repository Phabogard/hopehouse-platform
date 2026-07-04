# Services détaillés

## Règle commune

Chaque service passe par le moteur universel : création, validation, paiement, exécution, notification, reçu, historique, audit. Les transactions peuvent être annulées automatiquement pendant un délai configurable de 5 minutes par défaut si elles ne sont pas finalisées irréversiblement. Après ce délai, seul le Super Admin peut effectuer une annulation exceptionnelle avec justification et audit.

## Dépôt

Étapes : sélectionner bénéficiaire, afficher nom, saisir montant/devise, vérifier solde source, confirmer, débiter source, créditer destination, générer reçu/QR, notifier, auditer. Erreurs : solde insuffisant, bénéficiaire invalide, devise inactive, permission absente. Sécurité : JWT, appareil, RBAC, anti-doublon idempotent.

## Retrait

Un Client ne peut jamais retirer auprès d'un autre Client. Les retraits ne sont possibles qu'auprès d'un Agent ou d'un rôle autorisé. Étapes : scanner QR ou saisir code, vérifier type QR/bénéficiaire, afficher nom Client, confirmer montant, débiter Client, créditer Agent, Agent remet espèces hors application, calculer commission, reçu, audit.

## Transfert

Étapes : choisir destinataire, le système affiche toujours le nom du destinataire avant validation, saisir montant/devise, vérifier solde, confirmer, débiter, créditer, notifier, reçu. Erreurs : destinataire introuvable, QR mauvais type, solde insuffisant, délai dépassé.

## Achat de crédit et paiement de facture

Services configurés par catalogue : fournisseur, réseau, montant, devise, mode, connecteur éventuel. Le moteur valide service actif, règles d'éligibilité, wallet, exécution manuelle/semi-auto/auto, reçu et audit. Aucune logique fournisseur codée en dur.

## Marketplace accessoires

Hope House est fournisseur officiel. Les Agents achètent uniquement auprès de Hope House et paient exclusivement avec le Wallet Hope House. L'achat diminue le stock central et augmente le stock Agent. L'Agent fixe son prix de vente. Le bénéfice = prix de vente - prix d'achat - frais configurés. Historique complet obligatoire.

## Boutique Agent

Chaque Agent possède sa boutique de type Shopify : produits publiés, images, prix, stock disponible, commandes, ventes, bénéfice et historique. Les Clients consultent uniquement les produits disponibles.

## QR Code

Le système vérifie automatiquement le type du QR Code ou du bénéficiaire. Il affiche toujours le nom du destinataire avant validation. QR permanent pour identité, temporaire pour retrait/code, transactionnel pour reçu/opération.

## Fidélité, parrainage, promotions et bonus

Points, niveaux, récompenses, bonus, codes de parrainage et promotions sont configurables. Les règles déterminent événements éligibles, calcul, expiration, plafonds, anti-fraude et audit.

## Notifications et messagerie

Notifications liées aux commandes, wallets, sécurité, stock, conversations et promotions. Messagerie activable par canaux, avec visibilité selon rôle et audit d'accès administratif.

## Traçabilité argent et fraude

Le Super Admin peut suivre intégralement le parcours d'un argent : origine, réservations, débits, crédits, commissions, remboursements, corrections, reçus, QR, utilisateurs, appareils et timestamps. Toute opération doit être totalement traçable.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.
