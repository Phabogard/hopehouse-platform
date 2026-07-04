# Messagerie

## Objectif

La messagerie est proche de WhatsApp : messages privés, groupes, communautés, audio, vidéo, documents, images, réactions, sondages, réunions, statuts, promotions, annonces, recherche, archivage, notifications et présence.

## Communications configurables

Le Client peut choisir lui-même l'Agent, l'Administrateur, le Comptable ou le Super Admin avec qui discuter si l'option correspondante est activée par le Super Admin. Ces canaux sont configurables indépendamment.

## Visibilité

Un Agent ne voit que ses propres clients. Un Administrateur ne voit que les conversations autorisées. Le mode privé masque les conversations aux Administrateurs lorsque configuré, mais ne masque jamais au Super Admin. Le Super Admin peut consulter toute conversation avec justification et audit.

## Fonctionnalités

Messages texte, audio, appels audio, appels vidéo, images, vidéos, documents, groupes, communautés, annonces, statuts, sondages, réunions, promotions, réactions, recherche, archivage, accusés ✓, ✓✓, ✓✓ lus, indicateur « en train d'écrire » et présence en ligne.

## Écrans et boutons

Liste conversations, nouvelle conversation, choisir destinataire, groupe, communauté, appel audio, appel vidéo, joindre fichier, envoyer image, enregistrer audio, réagir, répondre, transférer, archiver, rechercher, signaler, activer mode privé.

## Technologies

WebSocket pour temps réel, stockage objets open source compatible pour médias, notifications push via Firebase Cloud Messaging si retenu, et bibliothèques libres autant que possible.

## Audit

Les messages ordinaires ne sont pas tous des audits métier, mais les consultations administratives, suppressions, signalements, exports, changements de confidentialité et accès Super Admin sont audités.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

- Moteur universel obligatoire.
- Configuration sans modification du code.
- Wallet numérique obligatoire pour toute opération financière.
- RBAC configurable vérifié côté serveur.
- Audit complet des actions sensibles.

