# Architecture cible — Moteur universel de commandes configurables

Statut : référence cible validée avant implémentation.

## 1. Vision

Hope House Platform ne doit jamais être construite pour un seul service, un seul fournisseur ou un seul réseau. La plateforme cible est un moteur universel de commandes configurable, capable de traiter aujourd'hui et dans plusieurs années :

- les ventes d'unités Airtel, Orange, Vodacom et Africell ;
- les forfaits Internet, SMS et Voix ;
- l'électricité, par exemple SNEL, NURU, Virunga, SOCODE ou futurs fournisseurs ;
- les bouquets TV, par exemple Canal+, StarTimes ou futurs fournisseurs ;
- les accessoires ;
- tout futur service ajouté depuis l'administration sans modification du code.

Le moteur de commandes lit la configuration. Il ne contient jamais de logique spécifique à Orange, Airtel, Canal+, Virunga ou à un autre fournisseur.

## 2. Principes obligatoires

- Tout service est défini par configuration.
- Tout catalogue est administrable sans recompilation.
- Toute permission est configurable.
- Tout connecteur est indépendant de la logique métier.
- Tout service suit le même cycle de commande.
- Tout changement important est historisé et audité.
- Toute opération financière passe par le portefeuille.
- Le mode manuel doit fonctionner sans connecteur.
- Le passage du manuel vers le semi-automatique ou l'automatique ne doit pas reconstruire l'application.

## 3. Cycle unique de commande

Chaque commande suit exactement le cycle suivant :

```text
Création
  -> Validation
  -> Exécution
  -> Notification
  -> Reçu
  -> Historique
  -> Audit
```

Ce cycle s'applique à tous les services : unités, forfaits, électricité, TV, accessoires et futurs services.

## 4. Modes de fonctionnement

Chaque service configuré possède un mode de fonctionnement actif :

| Mode | Description | Connecteur requis |
|---|---|---:|
| manuel | Un utilisateur autorisé, typiquement Super Admin, exécute l'action hors système puis valide le résultat | non |
| semi-automatique | Le système prépare ou assiste l'exécution, mais une validation humaine reste requise | optionnel |
| automatique | Le système exécute via un connecteur activé et configuré | oui |

Le changement de mode est une opération de configuration et ne doit jamais nécessiter une modification de code.

## 5. Catalogues dynamiques

Les catalogues dynamiques couvrent au minimum :

- réseaux ;
- fournisseurs ;
- services ;
- forfaits ;
- unités ;
- accessoires ;
- tarifs ;
- commissions ;
- devises ;
- modes de fonctionnement ;
- connecteurs ;
- règles d'éligibilité ;
- règles d'exécution ;
- règles de notification ;
- modèles de reçus.

Depuis l'administration, un utilisateur autorisé doit pouvoir ajouter, modifier, activer, désactiver ou supprimer logiquement les éléments de catalogue sans recompilation.

## 6. Rôles cibles

Les rôles fonctionnels cibles sont :

- Super Admin ;
- Administrateur ;
- Agent ;
- Client ;
- Comptable, si activé ;
- Auditeur, si activé.

Les rôles ne doivent pas être une contrainte définitive codée dans l'application. Ils sont des configurations initiales pouvant être ajustées via le système de permissions.

## 7. Permissions configurables

Le Super Admin possède initialement tous les droits, mais ces droits restent des permissions configurables.

Les permissions couvrent notamment :

- gestion des catalogues ;
- gestion des rôles ;
- gestion des permissions ;
- crédit de portefeuille ;
- débit de portefeuille ;
- validation des commandes ;
- gestion des fournisseurs ;
- gestion des réseaux ;
- gestion des forfaits ;
- gestion des accessoires ;
- gestion des commissions ;
- gestion des prix ;
- gestion des connecteurs ;
- consultation des historiques ;
- consultation des audits.

## 8. Acteurs

### Super Admin

Le Super Admin administre l'ensemble de la plateforme, les catalogues, les rôles, les permissions, les portefeuilles, les connecteurs et les validations sensibles.

### Administrateur

L'Administrateur gère les opérations autorisées par configuration. Son périmètre exact dépend des permissions activées.

### Agent

L'Agent vend pour le compte de clients ou exécute des opérations autorisées. Il possède un portefeuille USD/CDF.

### Client

Le Client est un acteur officiel. Il peut :

- créer un compte ;
- consulter son historique ;
- recevoir des notifications ;
- télécharger ses reçus ;
- consulter son portefeuille ;
- acheter directement si autorisé ;
- passer par un agent.

### Comptable

Le Comptable, si activé, consulte ou exporte les informations financières selon les permissions accordées.

### Auditeur

L'Auditeur, si activé, consulte les historiques et audits selon les permissions accordées.

## 9. Portefeuille multi-devise

Les agents et les clients possèdent un portefeuille multi-devise au minimum USD/CDF.

Toutes les opérations financières passent par le portefeuille :

- ventes ;
- dépôts ;
- retraits ;
- remboursements ;
- commissions ;
- corrections autorisées.

Le portefeuille ne dépend jamais d'un service spécifique. Les mouvements doivent être historisés et auditables.

## 10. Mode manuel prioritaire

Le mode manuel est prioritaire pour le démarrage.

Exemple générique, applicable à tous les services :

1. Un agent initie une commande pour un service configuré.
2. Le système vérifie son portefeuille.
3. Si le solde est suffisant :
   - la commande est créée ;
   - elle passe en attente d'exécution ;
   - le Super Admin reçoit une notification ;
   - le Super Admin exécute manuellement l'opération ;
   - il valide le résultat ;
   - le client reçoit une notification ;
   - le reçu est généré ;
   - l'historique est enregistré ;
   - l'audit est enregistré.
4. Si le solde est insuffisant :
   - la commande n'est pas créée comme commande exécutable ;
   - la tentative est enregistrée ;
   - l'agent reçoit un message d'insuffisance ;
   - le Super Admin reçoit une notification avec le compte concerné, le solde actuel et la tentative.

## 11. Connecteurs

Les connecteurs sont des adaptateurs techniques. Ils ne contiennent pas la logique métier et ne doivent pas être appelés directement par les modules métier.

Un connecteur doit pouvoir être :

- activé ;
- désactivé ;
- remplacé ;
- configuré ;
- lié à un fournisseur ou à un service configuré.

Le moteur de commandes décide quoi faire à partir de la configuration. Le connecteur exécute uniquement l'action technique lorsque le mode et la configuration l'autorisent.

## 12. Compatibilité avec le socle MVP

Le socle MVP existant reste conservé : utilisateurs, bénéficiaires, services, abonnements, paiements, factures, audit et RBAC. Il doit évoluer progressivement vers les concepts cibles sans suppression brutale de fonctionnalité.

Les modules actuels deviennent des capacités métier ou des références transitoires. Les nouvelles implémentations doivent éviter d'ajouter une logique spécifique à un fournisseur ou à un service dans ces modules.

## 13. Règle d'évolution

Avant toute future implémentation, il faut vérifier explicitement que la modification respecte :

- le moteur unique de commandes ;
- la configuration dynamique ;
- les catalogues administrables ;
- les permissions configurables ;
- le portefeuille multi-devise ;
- l'indépendance des connecteurs ;
- le cycle complet de commande ;
- l'audit et l'historique ;
- l'absence de logique spécifique à un fournisseur dans le code métier.
