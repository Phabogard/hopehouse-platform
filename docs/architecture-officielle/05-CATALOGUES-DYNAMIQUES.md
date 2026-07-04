# Catalogues dynamiques

## Source de vérité

Les catalogues administrent services, réseaux, fournisseurs, forfaits, unités, accessoires, prix, promotions, commissions, fidélité, parrainage, devises, connecteurs, permissions, rôles, notifications, reçus, QR Codes et paramètres.

## Structure minimale

Chaque item possède code stable, type, libellé, statut, métadonnées JSON, période de validité, auteur, historique et audit. Les suppressions sont logiques.

## Marketplace accessoires

Hope House est fournisseur officiel des accessoires. Le catalogue accessoires contient référence, nom, description, catégorie, images, prix d'achat, prix de vente recommandé, prix de vente Agent configurable, stock central, stock réservé, statut et règles de disponibilité.

Seuls les Agents achètent depuis le stock central via wallet Hope House. L'achat diminue automatiquement le stock central, augmente le stock Agent, calcule bénéfice potentiel et historise le mouvement. La boutique Agent de type Shopify expose uniquement le stock Agent disponible, ses prix configurés et son historique de ventes.

## Écrans administration

Liste, créer, modifier, activer, désactiver, archiver, consulter historique, importer, exporter, prévisualiser impacts et auditer. Les boutons destructifs demandent confirmation et justification.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

