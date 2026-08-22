# 35 — Recharge du wallet par Mobile Money

## Statut normatif

Ce document complète les contrats `02-REGLES-METIER`, `04-MOTEUR-DE-COMMANDES`, `05-CATALOGUES-DYNAMIQUES`, `06-WALLETS`, `18-CONNECTEURS`, `19-BASE-DE-DONNEES`, `29-SERVICES-DETAILLES` et `34-ASSISTANT-IA`.

Il définit la recharge d'un wallet HopeHouse à partir d'un paiement Mobile Money externe. Il ne crée pas un deuxième moteur financier : la commande, le wallet, l'idempotence, la notification et l'audit existants restent les composants propriétaires.

## 1. Principe

Un utilisateur peut demander à créditer son wallet HopeHouse en choisissant :

- le service de recharge ;
- le réseau Mobile Money configuré ;
- la devise (`CDF` ou `USD`) ;
- le montant strictement positif ;
- le compte/numéro Mobile Money utilisé selon le connecteur ou le mode manuel.

Exemples :

- `20 000 CDF` → crédit de `20 000 CDF` dans le wallet HopeHouse après rapprochement réussi ;
- `5 USD` → crédit de `5 USD` dans le wallet HopeHouse après rapprochement réussi.

Aucune conversion CDF/USD n'est implicite. Une conversion ne peut exister que comme service/règle de change explicitement configuré.

## 2. Deux modes officiels

### Mode manuel — MVP

Le mode manuel fonctionne sans connecteur opérateur :

1. Le Client choisit « Recharger ».
2. L'application affiche le réseau, le montant, la devise et les instructions de paiement.
3. L'utilisateur effectue le paiement dans l'application/USSD/interface officielle du fournisseur Mobile Money.
4. Le PIN Mobile Money est saisi uniquement dans l'interface sécurisée du fournisseur. **HopeHouse ne demande, ne reçoit et ne stocke jamais le PIN Mobile Money.**
5. Le fournisseur crédite le compte Mobile Money de trésorerie HopeHouse.
6. HopeHouse reçoit une notification externe ou une preuve de paiement disponible.
7. Le système crée une tentative de rapprochement avec référence externe, montant, devise, réseau, timestamp et statut.
8. Le Super Admin reçoit une notification de rapprochement à vérifier.
9. Après validation autorisée, le Wallet Engine crédite exactement le montant confirmé dans la devise concernée.
10. La commande passe par reçu, historique et audit.

Le mode manuel ne doit jamais créditer automatiquement un wallet uniquement parce qu'une notification textuelle ou une affirmation utilisateur a été reçue.

### Mode automatique — futur

Un connecteur Mobile Money actif peut recevoir une confirmation technique vérifiable du fournisseur et permettre le rapprochement automatique.

Le connecteur reste un adaptateur technique : il ne décide ni du prix, ni de la commission, ni du wallet cible, ni des permissions. Ces décisions restent dans le catalogue, le moteur de commandes, le RBAC et le Wallet Engine.

## 3. Sécurité du paiement externe

- Le PIN Mobile Money n'entre jamais dans un payload HopeHouse.
- Les secrets du connecteur ne sont jamais exposés au frontend, au modèle IA ou aux logs.
- Une référence externe unique est obligatoire lorsqu'elle est fournie par le réseau.
- Une notification du fournisseur peut être reçue plusieurs fois : l'idempotence doit empêcher tout double crédit.
- Le montant confirmé et la devise confirmée sont contrôlés avant crédit.
- Une différence entre montant demandé et montant confirmé produit un statut à vérifier, jamais un crédit silencieux.
- Les paiements inconnus ou non rapprochables restent en attente et sont visibles au Super Admin selon ses permissions.
- Toute correction manuelle exige justification, permission, audit et transaction wallet corrective ; l'historique original n'est jamais modifié.

## 4. États de recharge

`initiated` → `awaiting_payment` → `payment_detected` → `reconciliation_pending` → `confirmed` → `wallet_credited` → `receipt_issued`.

États alternatifs : `expired`, `cancelled`, `rejected`, `mismatch`, `duplicate`, `failed`.

Aucune transition ne doit produire un crédit Wallet avant l'état `confirmed`.

## 5. Rôle du Super Admin

Le Super Admin peut, selon ses permissions configurées :

- consulter les recharges en attente ;
- rechercher par utilisateur, montant, devise, réseau, référence externe ou période ;
- vérifier la preuve de paiement ;
- confirmer ou rejeter un rapprochement ;
- effectuer une correction autorisée ;
- consulter l'historique complet du mouvement ;
- recevoir des alertes de paiement inhabituel, doublon ou écart ;
- configurer les réseaux, fournisseurs, limites, commissions et connecteurs.

Une correction n'est jamais une modification directe du solde : elle passe par le Wallet Engine.

## 6. Rôle de l'IA

L'IA peut, si elle est activée pour le Super Admin :

- signaler qu'un nouveau paiement externe semble correspondre à une recharge ;
- rechercher les tentatives non rapprochées ;
- détecter doublons, écarts de montant, références réutilisées et comportements anormaux ;
- rappeler les recharges nécessitant une vérification ;
- préparer une proposition de rapprochement ;
- expliquer l'historique d'un mouvement ;
- produire des synthèses et calculs.

L'IA ne peut pas créditer silencieusement un wallet sur la seule base d'une inférence. Une action financière sensible reste soumise aux limites IA, au RBAC et à l'approbation humaine définis dans `34-ASSISTANT-IA`.

## 7. Architecture des données

La recharge réutilise :

- `orders` / `order_items` pour l'intention de recharge ;
- `wallet_transactions` pour le crédit réel ;
- `connectors` / `connector_bindings` pour l'intégration opérateur ;
- `notifications` pour les alertes ;
- `receipts` pour la preuve HopeHouse ;
- `audit_logs` pour la traçabilité ;
- le mécanisme d'idempotence existant pour empêcher les doubles traitements.

Une nouvelle table ne doit être créée que si une information de rapprochement externe ne peut pas être portée proprement par les modèles existants. La duplication de `wallet_transactions` ou la création d'un deuxième ledger est interdite.

## 8. UX cible

Le bouton `Recharger` ouvre un parcours simple :

`Choisir réseau → choisir devise → saisir montant → afficher instructions/paiement externe → retour à HopeHouse → état du rapprochement → confirmation → nouveau solde → reçu`.

Le montant est toujours affiché avec sa devise. Le changement de devise ne convertit pas automatiquement le montant.

## 9. IA et confidentialité

L'IA ne reçoit que les données nécessaires à la tâche et autorisées par le contexte de l'acteur. Elle ne peut jamais révéler à un autre utilisateur le contenu du wallet, des commandes, messages, documents, paiements ou comptes privés d'un tiers.

Le Super Admin dispose d'une visibilité administrative correspondant à ses permissions, avec audit. Même lui ne reçoit jamais de mots de passe, PIN Mobile Money, clés API ou autres secrets en clair.

## 10. Garde-fous

- Wallet Engine = seule autorité de modification des soldes.
- Order Engine = orchestration de la commande.
- Connecteur = adaptation technique uniquement.
- RBAC = autorité des permissions.
- Idempotence = protection contre les doubles crédits.
- Audit = traçabilité des décisions et corrections.
- IA = assistance sous politique, jamais contournement de ces composants.
