# Modèle conceptuel cible — Hope House Platform

Statut : modèle conceptuel documentaire, non migration de production.

## 1. Vue d'ensemble

Le modèle cible organise Hope House Platform autour de six ensembles :

1. identité et accès ;
2. catalogues dynamiques ;
3. moteur de commandes ;
4. portefeuilles et mouvements financiers ;
5. notifications, reçus et historiques ;
6. connecteurs indépendants.

## 2. Identité et accès

### User

Compte d'accès à la plateforme. Un utilisateur peut représenter un Super Admin, un administrateur, un agent, un client, un comptable ou un auditeur selon ses rôles et permissions configurés.

### Role

Groupe configurable de permissions. Les rôles initiaux sont Super Admin, Administrateur, Agent, Client, Comptable et Auditeur.

### Permission

Capacité élémentaire activable ou désactivable. Une permission est toujours vérifiée côté serveur.

### UserRole

Association entre un utilisateur et un rôle.

### RolePermission

Association entre un rôle et une permission.

## 3. Acteurs métier

### ClientProfile

Profil client lié à un utilisateur. Il permet les achats directs si autorisés, la consultation du portefeuille, des historiques, notifications et reçus.

### AgentProfile

Profil agent lié à un utilisateur. Il permet la vente pour des clients, sous réserve de permissions et de solde de portefeuille.

### Beneficiary

Personne ou compte bénéficiaire d'un service. Un bénéficiaire peut être le client lui-même ou une personne distincte selon la configuration du service.

## 4. Catalogues dynamiques

### Catalog

Regroupe des éléments administrables : réseaux, fournisseurs, services, forfaits, accessoires, tarifs, commissions ou autres types.

### CatalogItem

Élément générique de catalogue avec statut, type, libellé, métadonnées et période de validité éventuelle.

### Network

Réseau télécom ou réseau de service, par exemple Airtel, Orange, Vodacom, Africell ou futur réseau.

### Provider

Fournisseur ou opérateur : SNEL, NURU, Virunga, SOCODE, Canal+, StarTimes ou futur fournisseur.

### ServiceDefinition

Service configurable vendu par la plateforme : unité, forfait, électricité, TV, accessoire ou futur service.

### ServiceMode

Mode actif ou disponible pour un service : manuel, semi-automatique ou automatique.

### PriceRule

Règle de prix configurable par service, devise, canal, rôle, fournisseur, période ou autre critère validé.

### CommissionRule

Règle de commission configurable par service, agent, réseau, fournisseur, période ou autre critère validé.

## 5. Moteur de commandes

### Order

Commande universelle créée pour tout service. Elle ne contient pas de logique spécifique à un fournisseur.

### OrderItem

Ligne de commande liée à un service configuré, un prix et des métadonnées de commande.

### OrderStep

Étape du cycle : création, validation, exécution, notification, reçu, historique, audit.

### OrderAttempt

Tentative de commande non exécutable, par exemple solde insuffisant ou validation échouée. Elle doit être historisée et auditée.

### OrderHistory

Historique immuable des transitions de commande.

## 6. Portefeuilles

### Wallet

Portefeuille multi-devise lié à un agent ou à un client.

### WalletBalance

Solde par devise, notamment USD et CDF.

### WalletTransaction

Mouvement financier : dépôt, retrait, vente, remboursement, commission ou correction autorisée.

### WalletReservation

Réservation temporaire de fonds pour une commande en attente, si ce mécanisme est validé lors de l'implémentation.

## 7. Notifications, reçus et audit

### Notification

Message système adressé à un utilisateur ou rôle : client, agent, Super Admin, administrateur, comptable ou auditeur.

### Receipt

Reçu généré après exécution ou validation selon le cycle de commande.

### AuditLog

Trace non modifiable d'une action sensible, d'une transition de commande, d'un échec, d'un changement de configuration ou d'une opération financière.

## 8. Connecteurs

### Connector

Adaptateur technique activable ou désactivable.

### ConnectorConfiguration

Paramètres d'un connecteur. Les secrets éventuels devront être protégés selon une décision de sécurité dédiée.

### ConnectorBinding

Lien entre un connecteur et un fournisseur, réseau ou service configuré.

## 9. Relations principales

```text
User 1..n UserRole n..1 Role
Role 1..n RolePermission n..1 Permission
User 0..1 ClientProfile
User 0..1 AgentProfile
ClientProfile 0..n Beneficiary
Catalog 1..n CatalogItem
Provider 0..n ServiceDefinition
Network 0..n ServiceDefinition
ServiceDefinition 1..n PriceRule
ServiceDefinition 0..n CommissionRule
ServiceDefinition 1..n ServiceMode
Order 1..n OrderItem
Order 1..n OrderStep
Order 1..n OrderHistory
Order 0..n Notification
Order 0..n Receipt
AgentProfile 0..1 Wallet
ClientProfile 0..1 Wallet
Wallet 1..n WalletBalance
Wallet 1..n WalletTransaction
Connector 0..n ConnectorBinding
ConnectorBinding n..1 Provider
ConnectorBinding n..1 ServiceDefinition
```
