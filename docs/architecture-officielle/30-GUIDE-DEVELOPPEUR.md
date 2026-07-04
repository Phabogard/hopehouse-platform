# Guide complet du développeur

## Ajouter un nouveau service sans modifier la logique métier

1. Créer un service dans le catalogue. 2. Définir fournisseur/réseau si applicable. 3. Définir modes manuel/semi-automatique/automatique. 4. Créer règles de prix, commissions, éligibilité, notifications et reçus. 5. Lier un connecteur uniquement si nécessaire. 6. Ajouter permissions configurables. 7. Ajouter tests de configuration. Aucun code métier fournisseur ne doit être ajouté.

## Ajouter fournisseur, réseau ou pays

Créer un item de catalogue avec code stable, statut, métadonnées, règles de disponibilité, devise et relations. Aucun enum métier ne doit bloquer l'ajout.

## Ajouter un connecteur

Créer une configuration connecteur, déclarer capacités, entrées/sorties, secrets, timeouts, retries et mapping technique. Le moteur décide quand l'utiliser. Le connecteur ne calcule jamais prix, commission ou éligibilité.

## Ajouter produit/accessoire

Créer produit dans catalogue accessoires Hope House, définir stock central, prix d'achat, règles de disponibilité, images et métadonnées. Les Agents achètent via marketplace avec wallet.

## Ajouter une devise

Créer devise dans catalogue devises, configurer précision, symbole, règles wallet, limites, taux si nécessaire et tests. Les wallets doivent supporter solde disponible/réservé par devise.

## Ajouter rôle ou permission

Créer rôle/permission par configuration, documenter écrans/boutons concernés, ajouter audit de changement et test RBAC. Ne pas ajouter d'union TypeScript définitive comme source de vérité cible.

## Checklist

Documentation, OpenAPI, SQL/migration, tests, sécurité, RBAC, wallet, audit, performance et rollback sont obligatoires.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.
