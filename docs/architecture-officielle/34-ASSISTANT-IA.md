# 34 — Assistant IA HopeHouse

## Statut normatif

Ce document définit le contrat fonctionnel et de sécurité de l'assistant IA HopeHouse. Il complète les documents RBAC, sécurité, API, base de données, catalogue, moteur de commandes, wallets, messagerie et services. Il ne remplace aucun de ces domaines.

## Objectif

HopeHouse AI est une capacité métier intégrée au backend. Il doit aider chaque rôle uniquement selon les capacités explicitement autorisées et configurées par le Super Admin, sans permission implicite.

Le passage d'une IA désactivée à une IA active, ou d'un niveau de capacité à un autre, est une **configuration**. Il ne doit pas nécessiter de reconstruire l'application.

Rôles concernés :

- Super Admin
- Administrateur
- Agent
- Client
- Comptable
- Auditeur
- `finance_manager` reste un rôle technique historique/transitoire compatible avec le RBAC actuel.

## Niveaux de risque

- **L0** : conversation, explication, calcul, synthèse et aide sans mutation métier.
- **L1** : lecture de données déjà autorisées par le RBAC serveur.
- **L2** : opérations réversibles ou préparations contrôlées.
- **L3** : actions sensibles nécessitant une approbation humaine explicite.
- **L4** : interdit.

Le Tool Gateway serveur reste l'autorité d'exécution. Le modèle ne reçoit jamais un accès direct à PostgreSQL, au filesystem, aux wallets, aux secrets ou aux connecteurs.

## Première implémentation

Le backend expose `POST /ai/chat` derrière l'authentification existante. Le fournisseur OpenAI est appelé exclusivement côté serveur avec `OPENAI_API_KEY`. Le modèle est configurable par `OPENAI_MODEL` et utilise `gpt-5.6` par défaut.

La réponse native de la Responses API est interprétée depuis les éléments `output` de type message/contenu `output_text`. Le frontend ne doit jamais recevoir la clé API.

La capacité conversationnelle est désactivée par défaut. Le bootstrap actuel utilise `HOPEHOUSE_AI_ENABLED=true` pour activer la conversation ; cette bascule est transitoire et doit être remplacée par une configuration persistée dans `app_settings` avant l'activation générale.

## Politique IA configurable par rôle

La configuration effective doit pouvoir être portée par `app_settings`, sans dupliquer une table de politique IA.

Pour chaque rôle et, si nécessaire, chaque périmètre autorisé, la politique peut définir :

- activation/désactivation ;
- niveau de risque maximal ;
- mode d'approbation (`never`, `when_required`, `always`) ;
- nombre maximal d'actions par session ;
- plafond financier ;
- outils explicitement autorisés ;
- outils explicitement bloqués ;
- modèle et paramètres non sensibles ;
- règles d'alerte et de détection.

Une politique IA ne peut jamais augmenter les permissions RBAC, contourner les validations métier, supprimer une approbation obligatoire ou accéder aux données d'un autre utilisateur sans autorisation serveur.

## Capacités par rôle

### Super Admin

Si activée, l'IA peut aider à :

- surveiller les utilisateurs et signaler les comportements suspects ;
- analyser commandes, wallets, ventes, commissions, incidents et anomalies ;
- rechercher des historiques et expliquer des parcours financiers ;
- calculer des montants, bénéfices, commissions et indicateurs ;
- préparer des offres, promotions et configurations de catalogue ;
- conseiller sur les services, prix, risques et performances ;
- rappeler les tâches administratives ou les demandes client/agent/admin non traitées ;
- assister le support et les décisions opérationnelles ;
- préparer une action de blocage, désactivation ou correction ;
- exécuter uniquement les actions effectivement autorisées par les outils et la politique IA, avec approbation lorsque le niveau de risque l'exige.

Le Super Admin peut disposer d'une visibilité administrative globale correspondant à ses permissions. Cette visibilité est auditée. L'IA ne révèle jamais de secrets techniques, mots de passe, PIN, tokens ou clés privées, même au Super Admin.

### Administrateur

L'IA peut être activée ou désactivée par configuration et peut être limitée à certains modules. Elle peut aider à :

- traiter le support ;
- rechercher commandes, utilisateurs ou services dans son périmètre ;
- préparer validations, rejets, notes et notifications ;
- analyser des indicateurs opérationnels ;
- détecter des anomalies dans les données accessibles ;
- assister les communications clients.

L'Administrateur ne peut jamais utiliser l'IA pour obtenir un droit qu'il ne possède pas directement.

### Agent

Si activée, l'IA peut aider à :

- vendre les services autorisés ;
- rechercher des forfaits, réseaux, produits et offres ;
- consulter ses clients, commandes, historiques et commissions autorisés ;
- calculer prix, marge et bénéfice ;
- recommander une offre selon les règles du catalogue ;
- préparer une commande ou une réponse client ;
- assister la gestion de stock et de boutique ;
- rappeler les tâches et demandes en attente.

Les données d'autres Agents restent invisibles sauf autorisation explicite du RBAC.

### Client

Si activée, l'IA doit offrir une expérience conversationnelle chaleureuse et utile, sans élargir les droits métier du Client. Elle peut :

- expliquer les services et offres disponibles ;
- aider à rechercher un forfait, un service ou un accessoire ;
- aider à préparer une commande ;
- expliquer le wallet, les reçus et l'historique du Client ;
- effectuer des calculs simples ;
- répondre aux questions de support ;
- rechercher un Agent à proximité lorsque la localisation et cette capacité sont autorisées ;
- orienter vers l'achat d'accessoires via la boutique Agent ;
- signaler qu'une commande ou une demande d'assistance est prête à être poursuivie.

L'IA Client ne peut pas consulter les comptes, messages, commandes, wallets ou données privées d'autres Clients.

### Comptable / Auditeur

L'IA peut fournir calculs, synthèses et recherches dans le périmètre autorisé. Les responsabilités restent séparées : l'IA ne transforme pas un rôle de lecture/audit en rôle d'exécution financière.

## IA dans la messagerie

L'IA peut être activée pour certaines conversations ou canaux selon configuration. Un propriétaire de service/entreprise autorisé peut définir des instructions métier versionnées, par exemple :

- présentation de l'entreprise et des services ;
- ton de communication ;
- informations commerciales approuvées ;
- règles de qualification d'un prospect ;
- critères d'escalade vers un Agent ou un Administrateur ;
- événements nécessitant une notification interne.

L'IA peut détecter qu'un Client exprime une intention d'achat et prévenir les destinataires configurés. Elle ne doit pas inventer une offre, un prix, une disponibilité ou une commission : ces informations doivent provenir des catalogues et services autorisés.

Le contenu d'une conversation reste isolé selon son propriétaire et les permissions. Le composeur Messaging conserve ses propres règles dans `13-MESSAGERIE-COMPOSER.md` et l'IA ne contourne pas ces capacités.

## IA et services futurs payants

L'IA peut devenir elle-même une capacité vendable, sans devenir le moteur de commandes :

- assistance avancée ;
- analyse ou génération de rapports ;
- automatisations autorisées ;
- génération de site Web ou de contenu ;
- autres capacités IA introduites ultérieurement.

Une capacité IA facturable doit être représentée comme un service configuré dans le catalogue et exécutée par le moteur universel de commandes. Son prix, sa devise, ses limites d'utilisation, sa période, son statut et ses règles commerciales sont configurables par le Super Admin.

Avant toute consommation d'une capacité payante, le système doit vérifier l'éligibilité, le prix courant, le wallet et les limites. Une consommation gratuite ou promotionnelle doit également être représentée par une règle de catalogue/promotion explicite.

La génération de sites Web future doit rester séparée de la logique financière : l'IA produit un résultat ou une préparation de projet, puis le système applique les règles de service, validation, paiement, exécution, reçu, historique et audit. Aucun déploiement irréversible ne doit être effectué sans les contrôles et approbations correspondants.

## Confidentialité et cloisonnement

L'IA reçoit uniquement les données nécessaires à la tâche et autorisées par le contexte d'authentification serveur. Elle ne doit jamais divulguer à un utilisateur le contenu d'un autre compte.

Les informations suivantes sont toujours interdites au modèle et aux réponses utilisateur : mots de passe, PIN, refresh tokens, clés API, secrets de connecteurs, clés privées et autres credentials.

Les consultations administratives, les accès Super Admin et les actions IA sensibles sont auditables. Les données personnelles doivent être minimisées dans le contexte envoyé au fournisseur IA.

## Sécurité

- L'identité et le rôle viennent du contexte d'authentification serveur.
- Le corps HTTP ne peut pas choisir le rôle de l'utilisateur.
- Une politique désactivée refuse l'appel.
- Les messages sont limités en taille.
- Les secrets et jetons ne doivent jamais être transmis au modèle comme données applicatives.
- L'assistant ne doit pas prétendre avoir exécuté une mutation lorsqu'aucun outil métier n'a réellement été appelé.
- Les actions L3 nécessiteront une approbation humaine.
- Les outils L4 sont interdits.
- Les contrôles métier existants restent obligatoires même lorsqu'une action est déclenchée par l'IA.
- Les appels IA sont audités comme événements `ai.chat`.
- Une erreur, une réponse incertaine ou une donnée manquante doit conduire à une réponse prudente ou à une escalade, jamais à une invention.

## Trajectoire fonctionnelle

1. Conversation réelle L0.
2. Lecture L1 via outils métier autorisés et filtrés par RBAC.
3. Calculs et analyses à partir de données autorisées.
4. Aide aux agents et au service client.
5. Aide comptable et audit avec séparation des responsabilités.
6. Détection proactive des anomalies et alertes.
7. Actions réversibles L2 avec garde-fous.
8. Actions sensibles L3 avec approbation humaine.
9. Services IA payants et quotas configurables.
10. Génération de sites Web et autres capacités avancées lorsque le service correspondant est activé et payé/configuré.
11. Aucun L4.

Chaque étape doit être testée séparément avant d'élargir les capacités.

## Références normatives

- `02-REGLES-METIER.md` — règles transverses, configuration et audit.
- `04-MOTEUR-DE-COMMANDES.md` — cycle obligatoire des services.
- `05-CATALOGUES-DYNAMIQUES.md` — services, prix, promotions, commissions et paramètres configurables.
- `06-WALLETS.md` — source unique des soldes et transactions financières.
- `07-CLIENT.md` / `08-AGENT.md` / `09-ADMINISTRATEUR.md` / `10-SUPER-ADMIN.md` — responsabilités et limites des rôles.
- `16-SECURITE.md` / `17-RBAC.md` — sécurité et autorisation serveur.
- `18-CONNECTEURS.md` — intégrations techniques isolées du métier.
- `19-BASE-DE-DONNEES.md` — modèle de persistance et `app_settings`.
- `29-SERVICES-DETAILLES.md` — comportement des services vendables.
- `35-RECHARGE-MOBILE-MONEY.md` — recharge externe Mobile Money et rapprochement.

## Statut

Ce document appartient au corpus officiel Hope House Platform. Toute décision contraire doit être signalée, documentée et validée avant exécution.
