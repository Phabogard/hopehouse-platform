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

## Décision d'audit MVP

Le module `audit` reste le point central de création et de consultation des traces d'audit du MVP. Les opérations sensibles actuellement exposées par l'API doivent enregistrer :

- une trace `success` lorsque l'opération métier aboutit ;
- une trace `failure` lorsqu'une opération sensible échoue après validation, autorisation ou traitement ;
- l'auteur applicatif connu au moment de l'action, même si l'authentification JWT réelle n'est pas encore implémentée ;
- l'action, le type d'entité, l'entité concernée lorsque disponible, la date, le résultat et des métadonnées minimales utiles au diagnostic.

Les traces retournées par le module d'audit ne doivent pas permettre à un consommateur applicatif de modifier les entrées existantes ou la collection interne.

## Architecture cible configurable validée

La référence cible de Hope House Platform est désormais le moteur universel de commandes configurables. Toute future implémentation doit vérifier sa compatibilité avec :

- les catalogues dynamiques administrables sans recompilation ;
- le cycle unique Création -> Validation -> Exécution -> Notification -> Reçu -> Historique -> Audit ;
- les modes manuel, semi-automatique et automatique configurables ;
- les rôles et permissions configurables ;
- les portefeuilles multi-devise USD/CDF des agents et clients ;
- l'indépendance des connecteurs vis-à-vis de la logique métier ;
- l'absence de logique spécifique à un fournisseur dans le code métier.

Documents de référence :

- `docs/design/architecture-cible-commandes-configurables.md` ;
- `docs/design/modele-conceptuel-cible.md` ;
- `docs/design/diagrammes-moteur-commandes.md`.

## Évolution prévue

Le socle pourra évoluer vers une API structurée avec framework lorsque les documents de conception suivants auront stabilisé :

- les workflows ;
- les contrats API ;
- la persistance ;
- l'authentification ;
- les connecteurs ;
- les contraintes de déploiement.
