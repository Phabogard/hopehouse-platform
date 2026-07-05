# Wallets multi-devise

## Principes

Chaque wallet supporte plusieurs devises, au minimum USD et CDF. Toute opération financière passe par le wallet numérique. Les espèces physiques ne sont jamais enregistrées comme solde applicatif ; l'application enregistre uniquement les mouvements numériques, confirmations, reçus, commissions, historiques et audits.

## Soldes

Chaque devise possède solde disponible, solde réservé, statut et date de mise à jour. Aucun débit ne peut rendre le solde disponible négatif. Tout débit vérifie solde, statut wallet, devise, permissions et limites.

## Opérations

Paiement, dépôt, retrait, transfert, commission, remboursement, correction, réservation, libération et rollback sont des transactions wallet. Chaque transaction possède type, statut, montant, devise, initiateur, bénéficiaire, entité liée, reçu, QR transactionnel et audit.

## Implémentation actuelle — étape Wallet Engine

Le moteur Wallet est le seul composant applicatif autorisé à modifier un solde numérique. Les autres modules, y compris le moteur de commandes, doivent appeler le Wallet au lieu de manipuler directement les soldes.

### Modèles applicatifs

Le moteur définit `Wallet`, `WalletBalance`, `WalletTransaction` et `WalletReservation`. Un wallet possède des soldes par devise configurée, un historique immutable de transactions, des réservations, des événements d'audit et des clés de transaction déjà traitées pour empêcher les doubles traitements.

### Opérations génériques

Les opérations disponibles sont crédit, débit, réservation, libération, capture, rollback, vérification du solde et vérification des fonds disponibles. Chaque opération financière exige un acteur, un montant strictement positif, une devise fournie par configuration, des métadonnées optionnelles et peut recevoir une clé de transaction idempotente.

### Devises configurables

Le moteur ne contient aucune liste de devises autorisées. Il normalise uniquement le code devise à trois caractères. L'activation, la précision, les limites et les règles par devise devront provenir des catalogues configurables.

### Réservations et rollback

Une réservation déplace le montant du solde disponible vers le solde réservé. Une libération rend le montant disponible. Une capture consomme le solde réservé. Un rollback crée une nouvelle transaction de type `rollback` ou libère une réservation active ; il ne modifie jamais l'historique existant. Une même transaction ne peut être rollbackée qu'une seule fois.

### Audit et immutabilité

Chaque transaction génère un événement d'audit wallet. Les transactions, réservations, balances et événements retournés par le moteur sont immutables côté domaine. La persistance PostgreSQL reste représentée par le schéma conceptuel et sera branchée lors d'une étape dédiée.

### Intégration avec le moteur de commandes

Le handler configurable de l'étape `payment` du `OrderEngine` peut appeler le Wallet pour réserver, débiter ou capturer des fonds sans modifier le moteur de commandes. Aucun fournisseur, QR Code, marketplace, messagerie ou connecteur externe n'est branché dans cette étape.

## Dépôt Super Admin → Agent

Le Super Admin crédite le wallet Agent selon permissions. Aucun calcul de commission. L'action exige justification, audit et reçu.

## Dépôt Agent → Agent

Un Agent peut recharger un autre Agent si la configuration l'autorise. Le wallet source diminue, le wallet destination augmente. Aucune commission. Solde insuffisant = refus automatique.

## Dépôt Agent → Client

L'Agent recharge le Client avec son propre solde numérique. Le wallet Agent diminue, le wallet Client augmente, le reçu est généré, les notifications sont envoyées et l'audit est enregistré.

## Retrait Client → Agent

Le Client demande un retrait chez un Agent. Le système vérifie solde Client, QR/PIN/identité si requis, puis débite le Client et crédite l'Agent. L'Agent remet les espèces hors application. La commission est répartie selon règles configurables.

## Réservation et rollback

Une commande peut réserver des fonds avant exécution. En succès, la réservation est capturée. En échec, expiration ou annulation, la réservation est libérée. Toute correction tardive passe par une transaction de correction autorisée, justifiée et auditée.

## Écrans et boutons

Écran Solde, Transactions, Dépôt, Retrait, Transfert, Paiement, Réservation, Reçu, Scanner QR, Confirmer, Annuler, Télécharger reçu, Signaler problème. Les boutons Confirmer/Annuler exigent confirmation explicite.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion. Toute décision contraire doit être signalée, documentée et validée avant exécution.

## Garde-fous permanents

- Aucun service, réseau, fournisseur, forfait, accessoire, prix, commission, promotion, rôle, permission, connecteur, notification, reçu, QR Code ou paramètre ne doit être codé en dur.
- Tout service passe par le moteur universel de commandes : création, validation, paiement, exécution, notification, reçu, historique, audit.
- Toute opération financière passe par un wallet numérique multi-devise. Les espèces physiques ne sont jamais enregistrées comme solde applicatif.
- Les rôles et permissions sont configurables et vérifiés côté serveur.
- Les connecteurs sont indépendants de la logique métier.
- Les actions sensibles produisent historique et audit immuables.

