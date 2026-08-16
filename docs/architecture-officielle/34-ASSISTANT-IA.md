# 34 — Assistant IA HopeHouse

## Statut normatif

Ce document définit le contrat fonctionnel et de sécurité de l’assistant IA HopeHouse. Il complète les documents RBAC, sécurité, API et base de données existants. Le numéro 34 est volontaire : `33-MIGRATIONS-PRISMA.md` est déjà le contrat officiel des migrations Prisma/PostgreSQL.

## Objectif

HopeHouse AI est un assistant métier intégré au backend. Il doit aider chaque rôle selon les capacités explicitement autorisées par le Super Admin, sans obtenir de permission implicite.

Rôles concernés :

- Super Admin
- Administrateur
- Agent
- Client
- Comptable
- Auditeur
- `finance_manager` reste un rôle technique historique/transitoire compatible avec le RBAC actuel.

## Niveaux de risque

- L0 : conversation, explication, calcul, synthèse et aide sans mutation métier.
- L1 : lecture de données déjà autorisées par le RBAC serveur.
- L2 : opérations réversibles ou préparations contrôlées.
- L3 : actions sensibles nécessitant une approbation humaine explicite.
- L4 : interdit.

Le Tool Gateway serveur reste l'autorité d'exécution. Le modèle ne reçoit jamais un accès direct à PostgreSQL, au filesystem, aux wallets, aux secrets ou aux connecteurs.

## Première implémentation

Le backend expose `POST /ai/chat` derrière l'authentification existante. Le fournisseur OpenAI est appelé exclusivement côté serveur avec `OPENAI_API_KEY`. Le modèle est configurable par `OPENAI_MODEL` et utilise `gpt-5.6` par défaut.

La réponse native de la Responses API est interprétée depuis les éléments `output` de type message/contenu `output_text`. Le frontend ne doit jamais recevoir la clé API.

La capacité conversationnelle est désactivée par défaut. Le bootstrap actuel utilise `HOPEHOUSE_AI_ENABLED=true` pour activer la conversation ; cette bascule est transitoire et doit être remplacée par une configuration persistée dans `app_settings` avant l'activation générale.

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

## Configuration cible par Super Admin

À terme, `app_settings` devra porter la politique IA effective par rôle, avec au minimum :

- activation/désactivation ;
- niveau de risque maximal ;
- mode d'approbation ;
- quota d'actions par session ;
- plafond financier ;
- liste des outils autorisés ;
- liste des outils bloqués ;
- modèle et paramètres non sensibles ;
- règles de détection et d'alerte.

La configuration ne doit jamais permettre de contourner le RBAC métier, les validations de domaine, les contraintes financières ou les approvals obligatoires.

## Trajectoire fonctionnelle

1. Conversation réelle L0.
2. Lecture L1 via outils métier autorisés et filtrés par RBAC.
3. Calculs et analyses à partir de données autorisées.
4. Aide aux agents et au service client.
5. Aide comptable et audit avec séparation des responsabilités.
6. Détection proactive des anomalies et alertes.
7. Actions réversibles L2 avec garde-fous.
8. Actions sensibles L3 avec approbation humaine.
9. Aucun L4.

Chaque étape doit être testée séparément avant d'élargir les capacités.
