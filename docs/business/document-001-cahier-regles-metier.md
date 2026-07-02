# Document n°1 — Cahier des règles métier de Hope House ERP

Statut : validé avec réserves mineures.

## Principes officiels

- Les actions sensibles doivent être tracées.
- Les opérations critiques nécessitent une autorisation explicite.
- Les responsabilités doivent être séparées pour réduire les risques d'erreur et de fraude.
- Les règles métier doivent être appliquées côté interface, API, base de données, traitements internes, audit et tests.
- Les données critiques ne doivent pas être supprimées physiquement sans règle explicite.
- Les changements importants doivent être historisés.
- Les données obligatoires doivent être validées avant enregistrement.

## Domaines métier du MVP

- Utilisateurs.
- Rôles et permissions.
- Bénéficiaires.
- Services.
- Abonnements.
- Paiements.
- Factures.
- Audit.

## Règles structurantes

### Utilisateurs

- Chaque utilisateur possède un identifiant unique stable.
- Un utilisateur dispose d'un statut : actif, inactif, suspendu ou archivé.
- Un utilisateur ayant effectué des actions est désactivé ou archivé, mais non supprimé physiquement.
- Les modifications importantes d'un utilisateur sont auditées.

### RBAC

- Les permissions sont attribuées explicitement via des rôles.
- Le principe du moindre privilège s'applique.
- Les changements de droits sont audités.
- Les actions sensibles sont contrôlées côté serveur.
- L'auto-élévation de privilèges est interdite sans mécanisme validé.

### Bénéficiaires

- Chaque bénéficiaire possède un identifiant unique stable.
- Un bénéficiaire dispose d'un statut : actif, inactif, suspendu ou archivé.
- Les données personnelles sont accessibles uniquement aux utilisateurs autorisés.
- L'historique des relations avec services, abonnements, paiements, factures, documents et interactions importantes est conservé.

### Services

- Un service représente une prestation, une offre ou une activité.
- Un service dispose d'un statut : brouillon, actif, suspendu ou archivé.
- Un service peut être facturable ou non facturable.
- Les tarifs sont historisés.
- Un service utilisé n'est pas supprimé physiquement.

### Abonnements

- Un abonnement relie un bénéficiaire à un ou plusieurs services sur une période.
- Un abonnement dispose d'un statut : brouillon, actif, suspendu, résilié, expiré ou archivé.
- Les modifications d'un abonnement actif sont contrôlées et auditées.
- La suspension, la résiliation et le renouvellement doivent être explicites.

### Paiements

- Un paiement représente une opération financière liée à un bénéficiaire, une facture, un abonnement ou un service.
- Un paiement dispose d'un statut : initié, en attente, réussi, échoué, annulé, remboursé, partiellement remboursé ou rapproché.
- Un paiement contient un montant, une devise, une date, un statut, un tiers associé et un mode de paiement si applicable.
- Un paiement validé n'est pas supprimé ; il est corrigé par annulation, remboursement, avoir ou écriture corrective.

### Facturation

- Une facture représente une demande de paiement ou un document financier.
- Une facture dispose d'un statut : brouillon, émise, partiellement payée, payée, annulée, en retard ou archivée.
- Une facture émise possède un numéro unique.
- Une facture émise n'est pas supprimée physiquement.
- Les montants de facture doivent être cohérents avec leurs lignes.

### Audit

- Une trace d'audit identifie l'action, l'auteur, la date, l'entité concernée et le résultat.
- Les échecs d'actions sensibles peuvent être audités.
- Les journaux d'audit ne sont pas modifiables par les utilisateurs standards.

## Points à préciser progressivement

- Terminologie officielle : client, bénéficiaire, membre, résident ou usager.
- Moyens de paiement acceptés.
- Connecteurs externes.
- Règles comptables détaillées.
- Obligations légales et fiscales applicables.


## Vision fonctionnelle cible validée

La plateforme ne doit jamais être construite pour un seul service. Elle doit devenir un moteur de commandes universel capable de gérer les unités Airtel, Orange, Vodacom et Africell, les forfaits Internet/SMS/Voix, l'électricité, les fournisseurs TV, les accessoires et tous futurs services sans modification du code.

### Cycle obligatoire

Chaque service suit le même cycle :

1. Création.
2. Validation.
3. Exécution.
4. Notification.
5. Reçu.
6. Historique.
7. Audit.

Le moteur lit la configuration et ne contient aucune logique spécifique à un fournisseur, réseau ou service particulier.

### Catalogues dynamiques

Depuis l'administration, un utilisateur autorisé doit pouvoir ajouter, modifier, activer, désactiver ou supprimer logiquement sans recompilation :

- réseaux ;
- fournisseurs ;
- services ;
- forfaits ;
- unités ;
- accessoires ;
- prix ;
- commissions ;
- modes de fonctionnement ;
- connecteurs.

### Modes de fonctionnement

Chaque service fonctionne selon un mode configurable : manuel, semi-automatique ou automatique. Le changement de mode est une configuration et ne nécessite jamais de modification de code.

### Mode manuel prioritaire

Le système doit fonctionner entièrement sans connecteur. En mode manuel, si le solde du portefeuille est suffisant, la commande est créée en attente, le Super Admin est notifié, l'exécution est réalisée manuellement, le résultat est validé, le client est notifié, le reçu est généré, l'historique est enregistré et l'audit est enregistré.

Si le solde est insuffisant, la commande exécutable n'est pas créée, la tentative est enregistrée, l'agent ou le client reçoit un message d'insuffisance et le Super Admin reçoit une notification contenant le compte concerné, le solde actuel et la tentative.

### Portefeuille

Les agents et les clients possèdent un portefeuille USD/CDF. Toutes les ventes, dépôts, retraits, remboursements et commissions utilisent ce portefeuille. Le portefeuille ne dépend jamais d'un service particulier.

### Client

Le Client est un acteur officiel. Il peut créer un compte, consulter son historique, recevoir des notifications, télécharger ses reçus, consulter son portefeuille, acheter directement si autorisé ou passer par un agent.

### Super Admin

Le Super Admin possède initialement tous les droits, mais ces droits restent des permissions configurables. Il peut notamment gérer les catalogues, rôles, permissions, portefeuilles, commandes, fournisseurs, réseaux, forfaits, accessoires, commissions, prix, connecteurs, historiques et audits.

### Connecteurs

Les connecteurs ne doivent jamais être mélangés à la logique métier. Ils doivent pouvoir être activés, désactivés ou remplacés sans modifier les modules métier.
