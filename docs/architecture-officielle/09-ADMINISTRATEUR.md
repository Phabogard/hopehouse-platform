# Administrateur

## Responsabilités

L'Administrateur opère uniquement les modules qui lui sont attribués par RBAC configurable : support, validation, gestion partielle des catalogues, traitement d'incidents ou supervision locale.

## Limites

Il n'a jamais plus de droits que le Super Admin. Il ne consulte pas les conversations privées masquées par configuration. Il ne modifie pas les permissions hors délégation explicite.

## Permissions

Variables selon configuration : consulter tableaux de bord, valider commandes, gérer certains catalogues, bloquer/débloquer selon périmètre, consulter historiques autorisés, envoyer annonces ou promotions autorisées.

## Écrans

Tableau de bord Admin, Utilisateurs autorisés, Commandes, Catalogues délégués, Notifications, Rapports, Conversations autorisées, Incidents, Audit de périmètre.

## Boutons

Valider, Rejeter, Bloquer, Débloquer, Activer, Désactiver, Ajouter note, Assigner, Exporter, Notifier.

## Statistiques

Commandes traitées, incidents ouverts, validations, rejets, modules administrés, performances opérationnelles.

## Actions possibles

Administrer les modules autorisés, jamais les modules non attribués. Toute action sensible est auditée.

## Scénarios d'erreur

Permission absente, compte bloqué, wallet insuffisant, QR expiré, PIN invalide, données obligatoires manquantes, service inactif, limite dépassée, tentative de consultation non autorisée et erreur technique doivent produire message clair, absence d'effet partiel non maîtrisé, historique si pertinent et audit si sensible.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

- Moteur universel obligatoire.
- Configuration sans modification du code.
- Wallet numérique obligatoire pour toute opération financière.
- RBAC configurable vérifié côté serveur.
- Audit complet des actions sensibles.

