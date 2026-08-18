# 13 — Composeur de message

## Statut

Contrat d'interface et de comportement dérivé du contrat officiel de Messagerie.

## Objectif

Le composeur doit fournir, depuis le champ `Message` et son bouton de pièce jointe, un panneau d'actions proche de l'expérience WhatsApp tout en respectant les propriétaires de domaines HopeHouse.

Actions visibles dans le panneau :

1. **Document** — sélection d'un fichier détenu par Media & Storage.
2. **Galerie** — sélection d'une ou plusieurs images/vidéos détenues par Media & Storage.
3. **Catalogue** — référence vers un article/version détenu par Catalogue/Services.
4. **Réponse rapide** — utilisation d'un modèle versionné autorisé.
5. **Localisation** — point ponctuel ou partage de position en direct avec expiration obligatoire.
6. **Contact** — référence vers un contact autorisé par Identity/Contacts.
7. **Sondage** — question + au moins deux options, avec choix multiple/anonymat configurables.
8. **Événement** — événement existant ou invitation structurée avec horaires et fuseau.

## Règle fondamentale : conservation du brouillon

L'ouverture du panneau, la sélection d'une action et l'annulation d'une action **ne doivent jamais effacer le texte déjà présent dans le champ Message**.

Le frontend doit conserver un état équivalent à :

- `draftText` : texte courant ;
- `actionMenuOpen` : panneau ouvert/fermé ;
- `activeAction` : action actuellement configurée ;
- `pendingPayload` : payload préparé mais pas encore confirmé ;
- `capabilities` : actions autorisées pour le contexte courant.

Le backend expose les types et transitions de cet état dans `src/core/messaging/composer-actions.ts` et `src/core/messaging/composer-state.ts`.

## UX cible

```text
┌──────────────────────────────────────────────┐
│ Message                                      │
│                                              │
│  [texte conservé pendant toute l'action]     │
│                                              │
│  🙂   📎   📷   🎙️                     ➤     │
└──────────────────────────────────────────────┘

┌────────────┬────────────┬────────────┬────────────┐
│ 📄         │ 🖼️         │ 🛍️         │ ⚡         │
│ Document   │ Galerie    │ Catalogue  │ Réponse    │
│            │            │            │ rapide     │
├────────────┼────────────┼────────────┼────────────┤
│ 📍         │ 👤         │ 📊         │ 📅         │
│ Localisat. │ Contact    │ Sondage    │ Événement  │
└────────────┴────────────┴────────────┴────────────┘
```

L'illustration est une référence fonctionnelle ; le frontend reste libre sur les détails visuels tant que les actions, l'ordre, la conservation du brouillon et les règles de sécurité sont respectés.

## Cycle d'une action

`composer ouvert -> action sélectionnée -> payload préparé -> validation -> confirmation -> message prêt à envoyer`

Annulation :

`action sélectionnée -> annulation -> composeur ouvert/fermé selon UX -> draftText inchangé`

Une action non autorisée ne doit pas être affichée comme disponible. Le serveur reste l'autorité finale : le frontend ne peut pas transformer une capacité `false` en permission `true`.

## Propriété des données

- Document/Galerie : Media & Storage.
- Catalogue : Catalogue/Services.
- Réponse rapide : module de templates/versioning.
- Localisation : données de localisation avec politique de confidentialité et expiration.
- Contact : Identity/Contacts.
- Sondage : Messaging.
- Événement : module événementiel/calendrier.

Messaging ne copie pas les données maîtres de ces domaines dans son propre modèle. Il conserve des références et les informations minimales nécessaires au message/versionnement.

## Sécurité

- RBAC vérifié côté serveur.
- Mode privé respecté.
- Les consultations administratives, suppressions, signalements, exports et accès Super Admin restent auditables.
- Une localisation en direct exige une expiration.
- Les pièces jointes utilisent des références opaques `mediaFileId`.
- Aucun secret, jeton ou credential ne doit entrer dans un payload de composeur.
- Les actions financières ne sont pas ajoutées au panneau générique : elles passent par les modules financiers et le Wallet obligatoire.

## Suite d'implémentation

1. Exposer les capacités du composeur pour la conversation courante.
2. Ajouter les commandes Messaging qui transforment un payload confirmé en `Message`/`MessageVersion`.
3. Ajouter les adapters Media, Catalogue, Contacts et Calendar.
4. Ajouter l'Outbox `MessageCreated`.
5. Brancher le frontend sur le contrat d'état du composeur.
6. Tester chaque action et les scénarios d'annulation/conservation du brouillon.
