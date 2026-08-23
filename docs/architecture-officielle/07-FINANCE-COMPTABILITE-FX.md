# Finance, comptabilité et conversion de devises

**Statut : spécification d'architecture — aucune implémentation financière n'est autorisée sur cette base tant que les invariants ci-dessous ne sont pas testés.**

## 1. Objectif

Hope House possède un Wallet multi-devise. Le Wallet reste responsable des soldes et mouvements de fonds d'un utilisateur. La conversion de devises et la comptabilité sont des sous-systèmes séparés.

Les clients iPhone, Android et Web consomment les mêmes contrats backend ; aucune règle financière ne doit être implémentée séparément dans les interfaces.

## 2. Taux d'achat et de vente

Les taux sont configurables par un Super Admin autorisé et sont historisés.

Exemple :

- USD → CDF : `1 USD = 2250 CDF`
- CDF → USD : `2350 CDF = 1 USD`

Ces deux taux sont volontairement distincts. Un taux appliqué à une conversion est figé dans l'enregistrement de cette conversion et ne change jamais après règlement.

Le système ne doit jamais recalculer une conversion historique avec le taux courant.

## 3. Composants

### Wallet

Responsable de :

- soldes par devise ;
- crédit et débit ;
- réservations ;
- transactions Wallet ;
- idempotence des mouvements.

Le Wallet ne doit pas devenir un moteur FX ou un journal comptable.

### FX

Le module FX sera responsable de :

- configuration/historique des taux ;
- validation d'une paire de devises ;
- calcul du montant destination ;
- création d'une `CurrencyConversion` ;
- conservation du taux effectivement appliqué ;
- idempotence de la conversion ;
- orchestration atomique du débit source et du crédit destination.

Modèle conceptuel minimal d'une conversion :

```text
CurrencyConversion
- conversionId
- walletId
- sourceCurrency
- sourceAmountMinor
- destinationCurrency
- destinationAmountMinor
- rateNumerator / rateDenominator (ou représentation décimale exacte)
- rateDirection
- transactionKey
- actorId
- status
- createdAt
- settledAt
```

Les montants doivent rester en unités mineures. Aucun calcul financier critique ne doit utiliser des flottants binaires.

### Accounting

La comptabilité sera indépendante du Wallet et du FX. Elle fournira un journal en partie double :

```text
Account
JournalEntry
JournalLine
```

Invariant fondamental : pour chaque `JournalEntry`, la somme des débits est égale à la somme des crédits dans la même unité comptable.

La marge FX ne doit jamais être déduite uniquement de la différence entre les deux taux. Son traitement dépend de la contrepartie économique et de la position de Hope House en devises. Toute écriture de revenu FX doit donc être générée par une règle comptable explicite.

## 4. Atomicité d'une conversion

Une conversion doit être atomique au niveau PostgreSQL :

```text
BEGIN
  vérifier idempotence
  verrouiller/valider les balances concernées
  débiter la devise source
  créditer la devise destination
  créer CurrencyConversion
  créer les écritures comptables nécessaires
  créer l'audit
COMMIT
```

Une erreur sur une étape doit annuler toutes les étapes.

Il est interdit de réaliser un débit puis un crédit dans deux transactions indépendantes.

## 5. Idempotence

Une même clé d'opération ne doit jamais produire deux conversions financières. Une répétition avec la même identité doit retourner le résultat de la première opération conformément au contrat d'idempotence du projet.

## 6. Audit

Chaque changement de taux et chaque conversion réglée doivent être audités. L'audit doit permettre de retrouver : acteur, wallet, devise source, montant source, devise destination, montant destination, taux appliqué, identifiant d'opération et horodatage.

## 7. Configuration des taux

Le Super Admin pourra modifier les taux selon les permissions qui seront définies par le RBAC. Une modification crée une nouvelle version effective ; elle ne modifie pas les conversions passées.

## 8. Interface utilisateur

Le bouton **Convertir** est une capacité commune exposée par l'API. Les interfaces iPhone, Android et Web peuvent la présenter différemment, mais elles utilisent les mêmes règles et le même résultat backend.

L'écran doit afficher avant confirmation :

- devise source ;
- montant source ;
- devise destination ;
- taux actuel ;
- montant destination estimé ;
- confirmation explicite.

Après confirmation, le résultat final vient du backend et non d'un calcul client.

## 9. Invariants obligatoires avant mise en production

- aucune balance négative ;
- aucune conversion partiellement appliquée ;
- aucune double conversion pour la même clé d'idempotence ;
- taux historique immuable ;
- calcul exact en unités mineures ;
- conversion USD → CDF et CDF → USD cohérente avec les taux configurés ;
- journal comptable équilibré ;
- audit durable ;
- rollback complet en cas d'échec ;
- autorisation RBAC sur la gestion des taux ;
- aucune logique financière spécifique à iPhone, Android ou Web.

## 10. Ordre d'implémentation

1. Modèle et tests du journal comptable.
2. Modèle et tests des taux FX.
3. Modèle et tests des conversions.
4. Transaction PostgreSQL atomique Wallet + FX + Accounting.
5. API et RBAC.
6. Interface iPhone / Android / Web.
7. Intégration recharge, paiement et services.

Aucune migration Prisma ne doit être créée avant validation des tests de domaine et des invariants comptables.
