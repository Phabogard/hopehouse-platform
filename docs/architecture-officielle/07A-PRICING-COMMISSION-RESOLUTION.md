# Pricing & Commission Resolution

## Statut normatif

Ce document définit le contrat normatif de résolution des prix et commissions avant la création d'une commande. Il complète les règles Catalogue, Commandes et Wallet. Toute implémentation doit respecter ce contrat ou faire évoluer explicitement ce document.

## 1. Principe d'autorité

Le client peut exprimer une intention monétaire, mais il ne constitue jamais la source d'autorité du prix commercial. Le prix applicable est résolu côté serveur à partir de la configuration Catalogue publiée et valide.

Une commande payable ne peut être créée avec un montant arbitraire fourni par le client.

## 2. Entrée de résolution

La résolution reçoit au minimum :

- service ;
- catalog item ;
- devise demandée ;
- instant de résolution ;
- contexte métier disponible (notamment canal, rôle, fournisseur ou réseau lorsqu'ils sont applicables au service).

Le resolver doit utiliser uniquement les critères réellement définis et supportés par le modèle de données. Un critère non disponible ne doit pas être inventé ni déduit implicitement.

## 3. Validité d'une PriceRule

Une règle est candidate uniquement si :

- elle correspond au service et à l'article concernés selon son scope ;
- son statut autorise son utilisation ;
- sa devise correspond à la devise commerciale résolue ;
- elle est valide à l'instant de résolution : `startsAt <= now` lorsqu'un début existe et `now < endsAt` lorsqu'une fin existe.

Une règle future ou expirée n'est jamais candidate.

## 4. Sélection et conflits

Le moteur doit distinguer les règles qui coexistent légitimement parce qu'elles ciblent des contextes différents des conflits réels.

Il est interdit de considérer automatiquement toute pluralité de PriceRule actives comme une erreur.

La priorité entre scopes et critères doit être explicitement définie par le modèle métier avant d'être codée. Tant qu'une priorité normative n'est pas définie pour un cas donné, une ambiguïté de résolution doit être refusée comme configuration non déterministe, et non résolue arbitrairement.

## 5. Prix de commande

Une résolution réussie produit un snapshot immuable du prix applicable comprenant au minimum :

- montant en unités mineures ;
- devise ;
- identifiant de la règle appliquée lorsque disponible ;
- instant de résolution ;
- contexte nécessaire à l'audit.

Le montant final utilisé par Wallet doit provenir de ce résultat serveur.

Si l'API accepte un montant attendu par le client, celui-ci peut être contrôlé contre le résultat officiel, mais ne peut jamais remplacer ce résultat.

## 6. Commission

La commission est résolue séparément du prix catalogue lorsqu'une CommissionRule est applicable. Elle suit les mêmes principes : configuration serveur, validité temporelle, contexte explicite, résolution déterministe et snapshot dans la transaction métier.

Aucune commission ne doit être codée en dur dans un service métier.

## 7. Atomicité

La résolution du prix, la création de l'Order et toute réservation Wallet qui en dépend doivent respecter les garanties transactionnelles prévues par le moteur de commandes. Une erreur de résolution ou une ambiguïté ne doit produire aucun effet financier partiel.

## 8. Historique et audit

Le snapshot de prix/commission doit permettre de déterminer a posteriori pourquoi le montant a été appliqué. Les données nécessaires à l'audit ne doivent pas dépendre d'une relecture ultérieure d'une configuration Catalogue qui pourrait avoir changé.

## 9. Évolution

L'ajout d'un nouveau critère de résolution, d'une nouvelle priorité ou d'une nouvelle forme de commission nécessite la mise à jour de ce document, des contrats API/SQL concernés et des tests de cohérence avant mise en production.
