# Services détaillés

## Règle commune

Chaque service passe par le moteur universel : création, validation, paiement, exécution, notification, reçu, historique, audit. Les transactions peuvent être annulées automatiquement pendant un délai configurable de 5 minutes par défaut si elles ne sont pas finalisées irréversiblement. Après ce délai, seul le Super Admin peut effectuer une annulation exceptionnelle avec justification et audit.

## Dépôt

Étapes : sélectionner bénéficiaire, afficher nom, saisir montant/devise, vérifier solde source, confirmer, débiter source, créditer destination, générer reçu/QR, notifier, auditer. Erreurs : solde insuffisant, bénéficiaire invalide, devise inactive, permission absente. Sécurité : JWT, appareil, RBAC, anti-doublon idempotent.

## Retrait

Un Client ne peut jamais retirer auprès d'un autre Client. Les retraits ne sont possibles qu'auprès d'un Agent ou d'un rôle autorisé. Étapes : scanner QR ou saisir code, vérifier type QR/bénéficiaire, afficher nom Client, confirmer montant, débiter Client, créditer Agent, Agent remet espèces hors application, calculer commission, reçu, audit.

## Transfert

Étapes : choisir destinataire, le système affiche toujours le nom du destinataire avant validation, saisir montant/devise, vérifier solde, confirmer, débiter, créditer, notifier, reçu. Erreurs : destinataire introuvable, QR mauvais type, solde insuffisant, délai dépassé.

## Recharge du wallet par Mobile Money

La recharge externe est définie par `35-RECHARGE-MOBILE-MONEY.md`. Le mode manuel ne nécessite aucun connecteur : le paiement est effectué dans l'interface officielle du fournisseur Mobile Money, puis un rapprochement autorisé crédite le wallet HopeHouse. Le PIN Mobile Money n'entre jamais dans HopeHouse.

Le mode automatique futur utilise les connecteurs configurés sans déplacer la logique métier dans le connecteur. Les références externes et notifications doivent être idempotentes afin d'empêcher les doubles crédits. Toute recharge confirmée utilise le Wallet Engine et produit reçu, historique et audit.

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

## Services IA

L'IA est une capacité configurable, pas un remplacement du moteur de commandes. Les capacités IA futures qui sont vendues aux utilisateurs (assistance avancée, analyses, automatisations autorisées, génération de contenu ou génération de site Web) sont représentées comme des services/catalogue configurables. Le prix, la devise, les quotas, la période, le statut et les promotions sont configurables par le Super Admin.

Une capacité IA payante suit le même cycle que les autres services : éligibilité, prix, paiement/réservation wallet, exécution via les outils autorisés, résultat, notification, reçu, historique et audit. La génération de site Web future ne peut pas contourner le paiement, le RBAC, les limites IA ou les approbations nécessaires.

Le contrat détaillé des rôles, limites, confidentialité, niveaux de risque et approbations IA se trouve dans `34-ASSISTANT-IA.md`.

## Notifications et messagerie

Notifications liées aux commandes, wallets, sécurité, stock, conversations et promotions. Messagerie activable par canaux, avec visibilité selon rôle et audit d'accès administratif.

## Traçabilité argent et fraude

Le Super Admin peut suivre intégralement le parcours d'un argent : origine, réservations, débits, crédits, commissions, remboursements, corrections, reçus, QR, utilisateurs, appareils et timestamps. Toute opération doit être totalement traçable.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.
