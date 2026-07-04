# Règles métier officielles

## Règles transverses

Les données critiques sont supprimées logiquement, jamais physiquement sans règle explicite. Les validations obligatoires sont appliquées côté interface, API, domaine, base de données, audit et tests.

## Commandes

Toute vente, achat d'accessoire, dépôt, retrait, transfert, remboursement, correction ou opération de service est représenté par une commande ou une opération wallet auditée. Les tentatives refusées pour solde insuffisant, identité invalide, QR expiré, code utilisé ou permission manquante sont historisées.

## Dépôts et retraits

Un agent recharge un client avec son propre solde numérique. Le dépôt diminue le wallet numérique de l'agent et augmente celui du client. Il est refusé automatiquement si le solde agent est insuffisant.

Un retrait Client → Agent diminue le wallet numérique du client, augmente le wallet numérique de l'agent, puis l'agent remet les espèces hors système. Les espèces ne sont jamais enregistrées comme actif applicatif : seule la dette numérique et les mouvements wallet sont gérés.

Dépôt Agent → Agent : aucune commission. Dépôt Super Admin → Agent : aucune commission. Retrait Client → Agent : commission répartie selon configuration. Les pourcentages, seuils, plafonds, périodes et bénéficiaires de commission sont entièrement configurables.

## Client sans compte

Le système peut envoyer de l'argent à une personne sans compte Hope House. Il génère un QR Code temporaire, un code de retrait, un PIN, une date d'expiration, un statut et un historique. L'agent valide QR Code, PIN et nom du bénéficiaire. Le code devient inutilisable après retrait. Le client peut annuler tant que le code n'est pas utilisé. Après plusieurs retraits sans compte, la création de compte peut être proposée selon seuil configurable.

## Marketplace accessoires

Hope House est le fournisseur officiel des accessoires. Seuls les Agents achètent les accessoires depuis la marketplace avec leur wallet Hope House. L'achat diminue le stock central, augmente le stock Agent, débite le wallet Agent, historise l'achat et calcule prix d'achat, prix de vente configurable et bénéfice estimé/réalisé. Chaque Agent dispose d'une boutique de type Shopify avec catalogue, stock, prix, commandes, ventes et historique.

## Fidélité, parrainage et promotions

Les points, niveaux, récompenses, bonus, codes de parrainage et promotions sont configurables. Les calculs sont auditables, réversibles par correction autorisée et reliés aux commandes ou transactions concernées.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

