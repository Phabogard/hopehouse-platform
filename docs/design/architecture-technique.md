# Architecture technique — Hope House ERP

## Objectif

Le MVP adopte une architecture modulaire TypeScript côté API, organisée par domaines métier. Le socle est volontairement léger afin de stabiliser les règles métier, les contrats API et les tests avant l'ajout de frameworks plus lourds.

## Principes

- Séparation des domaines métier.
- Validation explicite des commandes.
- Contrôle RBAC côté serveur.
- Audit des actions sensibles.
- Suppression logique pour les données critiques.
- Contrats API documentés.
- Tests automatisés des règles structurantes.

## Couches

```text
src/
  core/             # Types partagés, erreurs, validation, serveur HTTP
  modules/          # Domaines métier isolés
    audit/
    beneficiaries/
    invoices/
    payments/
    rbac/
    services/
    subscriptions/
    users/
```

## Décision technique initiale

Le premier socle utilise Node.js et TypeScript sans framework applicatif. Cette décision réduit le couplage initial et permet de faire émerger les règles métier avant de choisir un framework serveur définitif.

## Évolution prévue

Le socle pourra évoluer vers une API structurée avec framework lorsque les documents de conception suivants auront stabilisé :

- les workflows ;
- les contrats API ;
- la persistance ;
- l'authentification ;
- les connecteurs ;
- les contraintes de déploiement.
