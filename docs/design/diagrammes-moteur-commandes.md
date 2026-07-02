# Diagrammes textuels — Moteur de commandes Hope House Platform

Statut : diagrammes conceptuels de référence.

## 1. Cycle standard de commande

```text
[Création]
    |
    v
[Validation]
    |
    v
[Exécution]
    |
    v
[Notification]
    |
    v
[Reçu]
    |
    v
[Historique]
    |
    v
[Audit]
```

Ce cycle est obligatoire pour tous les services.

## 2. Création en mode manuel avec solde suffisant

```text
Agent ou Client
    |
    | demande un service configuré
    v
Moteur de commandes
    |
    | lit catalogue + prix + commission + mode
    v
Contrôle portefeuille
    |
    | solde suffisant
    v
Commande créée
    |
    v
Commande en attente d'exécution manuelle
    |
    v
Notification Super Admin
    |
    v
Super Admin exécute hors système
    |
    v
Super Admin valide le résultat
    |
    v
Notification client / agent
    |
    v
Reçu généré
    |
    v
Historique enregistré
    |
    v
Audit enregistré
```

## 3. Création en mode manuel avec solde insuffisant

```text
Agent ou Client
    |
    | demande un service configuré
    v
Moteur de commandes
    |
    | lit catalogue + prix + commission + mode
    v
Contrôle portefeuille
    |
    | solde insuffisant
    v
Commande exécutable non créée
    |
    v
Tentative enregistrée
    |
    v
Notification agent ou client : solde insuffisant
    |
    v
Notification Super Admin : compte, solde, tentative
    |
    v
Historique de tentative
    |
    v
Audit de tentative
```

## 4. Mode semi-automatique

```text
Commande créée
    |
    v
Validation métier
    |
    v
Préparation automatique ou assistée
    |
    v
Validation humaine obligatoire
    |
    v
Exécution confirmée
    |
    v
Notification -> Reçu -> Historique -> Audit
```

Le mode semi-automatique peut utiliser un connecteur, mais ne lui délègue pas toute la décision métier.

## 5. Mode automatique

```text
Commande créée
    |
    v
Validation métier
    |
    v
Sélection du connecteur activé
    |
    v
Exécution technique par connecteur
    |
    v
Interprétation du résultat technique
    |
    v
Notification -> Reçu -> Historique -> Audit
```

Le connecteur exécute techniquement. Le moteur de commandes conserve la responsabilité du cycle métier.

## 6. Séparation logique métier / connecteur

```text
Moteur de commandes
    |
    | décision métier basée sur configuration
    v
Port de connecteur
    |
    | contrat technique stable
    v
Adaptateur fournisseur
    |
    | API externe ou action technique
    v
Résultat normalisé
    |
    v
Moteur de commandes
```

Aucune règle spécifique à Orange, Airtel, Canal+, SNEL, NURU, Virunga ou autre fournisseur ne doit être codée dans le moteur métier.

## 7. Flux portefeuille

```text
Commande demandée
    |
    v
Calcul prix + commission
    |
    v
Vérification solde USD/CDF
    |
    +--> solde insuffisant -> tentative + notifications + audit
    |
    +--> solde suffisant -> mouvement ou réservation portefeuille
                                |
                                v
                         exécution commande
                                |
                                v
                  vente / remboursement / commission
                                |
                                v
                    historique financier + audit
```
