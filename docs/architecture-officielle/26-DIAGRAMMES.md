# Diagrammes

## Architecture globale

```mermaid
flowchart TD
  UI[Web/Mobile/Admin] --> API[REST OpenAPI / WebSocket]
  API --> AUTH[JWT + Sécurité appareil]
  AUTH --> RBAC[RBAC configurable]
  RBAC --> Engine[Moteur universel]
  Engine --> Catalog[Catalogues dynamiques]
  Engine --> Wallet[Wallets numériques]
  Engine --> QR[QR Codes]
  Engine --> Notify[Notifications]
  Engine --> Receipt[Reçus]
  Engine --> Audit[Audit immuable]
  Engine --> Connector[Connecteurs indépendants]
  Catalog --> DB[(PostgreSQL)]
  Wallet --> DB
  QR --> DB
  Audit --> DB
  Connector --> External[Fournisseurs externes]
```

## Cycle commande

```mermaid
flowchart LR
  Creation --> Validation --> Paiement --> Execution --> Notification --> Recu --> Historique --> Audit
```

## Dépôt Agent vers Client

```mermaid
sequenceDiagram
  Agent->>API: Dépôt client
  API->>Wallet: Vérifier solde Agent
  Wallet-->>API: Suffisant
  API->>Wallet: Débiter Agent / Créditer Client
  API->>Receipt: Générer reçu + QR transactionnel
  API->>Audit: Audit
```

## Retrait Client vers Agent

```mermaid
sequenceDiagram
  Client->>Agent: Demande retrait + QR/PIN
  Agent->>API: Scanner et confirmer
  API->>Wallet: Débiter Client / Créditer Agent
  Agent-->>Client: Remise espèces hors application
  API->>Audit: Commission + reçu + audit
```

## Marketplace accessoires

```mermaid
flowchart LR
  Agent --> Buy[Achat accessoire]
  Buy --> Debit[Débit wallet Agent]
  Debit --> Central[Stock central diminue]
  Central --> Stock[Stock Agent augmente]
  Stock --> Shop[Boutique Agent]
  Shop --> Profit[Bénéfice calculé]
```

## Messagerie

```mermaid
flowchart TD
  Client --> Agent
  Client --> Admin
  Client --> Comptable
  Client --> SuperAdmin
  Agent --> OwnClients[Uniquement ses clients]
  Admin --> Allowed[Conversations autorisées]
  SuperAdmin --> All[Accès administrateur audité]
```

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.


## Transfert

```mermaid
sequenceDiagram
  Sender->>API: Demande transfert
  API->>QR: Vérifier destinataire/type
  API->>Sender: Afficher nom destinataire
  Sender->>API: Confirmation
  API->>Wallet: Débiter source / Créditer destination
  API->>Audit: Reçu + historique + audit
```

Ce diagramme impose l'affichage du nom avant validation et le passage par wallet.

## Stock et boutique Agent

```mermaid
flowchart LR
  Central[Stock central Hope House] -->|achat Agent| AgentStock[Stock Agent]
  AgentStock --> Shop[Boutique Agent]
  Shop --> ClientOrder[Commande Client]
  ClientOrder --> Profit[Bénéfice Agent]
```

Le stock central diminue après achat Agent et le stock Agent augmente automatiquement.

## QR Code

```mermaid
flowchart TD
  Scan[Scan QR] --> Type[Vérifier type QR]
  Type --> Name[Afficher nom]
  Name --> Confirm[Confirmation obligatoire]
  Confirm --> Execute[Transaction]
  Execute --> Audit[Audit]
```

## Sécurité et RBAC

```mermaid
flowchart LR
  Request --> JWT[JWT]
  JWT --> Device[Empreinte appareil]
  Device --> RBAC[Permission configurable]
  RBAC --> Action[Action autorisée]
  RBAC --> Deny[Refus 403]
```

## Notifications

```mermaid
flowchart TD
  Event[Événement métier] --> Rule[Règle notification]
  Rule --> Channel[Canal configuré]
  Channel --> User[Utilisateur/Rôle]
  Rule --> Audit[Audit si sensible]
```

## Fidélité et parrainage

```mermaid
flowchart LR
  Order[Commande] --> Eligibility[Éligibilité]
  Eligibility --> Points[Points/Bonus]
  Points --> Reward[Récompense]
  Referral[Parrainage] --> Reward
```

## Commandes accessoires et livraison

```mermaid
sequenceDiagram
  Agent->>Marketplace: Commander accessoires
  Marketplace->>Wallet: Débiter Agent
  Marketplace->>Stock: Diminuer stock central
  Marketplace->>AgentStock: Augmenter stock Agent
  Marketplace->>Delivery: Préparer livraison si activée
  Marketplace->>Audit: Historique complet
```

## Audit et fraude

```mermaid
flowchart TD
  Money[Parcours argent] --> Transactions[Transactions]
  Transactions --> Devices[Appareils]
  Transactions --> QR[QR/Reçus]
  Transactions --> Commissions[Commissions]
  Transactions --> Corrections[Corrections]
  Corrections --> Fraud[Détection fraude]
  Fraud --> SuperAdmin[Super Admin]
```

Le Super Admin doit pouvoir suivre intégralement le parcours d'un argent pour détecter une fraude.
