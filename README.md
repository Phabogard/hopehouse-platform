# hopehouse-platform

Plateforme numérique de gestion des services, paiements et abonnements.

## Statut

Socle MVP initial de Hope House ERP.

## Stack actuelle

- Node.js 20+
- TypeScript
- API HTTP native Node.js
- Tests avec `node:test`

## Commandes

```bash
npm install
npm run build
npm test
npm run dev
```

## Structure

```text
docs/       Documents de conception
database/   Schéma conceptuel SQL initial
src/        API MVP TypeScript modulaire
tests/      Tests automatisés
```

## Principes

- Règles métier conformes au Document n°1.
- RBAC contrôlé côté serveur.
- Audit prévu pour les actions sensibles.
- Suppression physique évitée pour les données critiques.


## Notifications push FCM

Le transport de notification reste provider-independent : `NotificationDeviceFanoutTransport` sélectionne les devices actifs par `userId`, puis délègue à un sender provider.

Pour activer FCM HTTP v1 en production :

- `NOTIFICATION_TRANSPORT=fcm`
- `FIREBASE_SERVICE_ACCOUNT_JSON` : JSON du compte de service Firebase/Google, stocké comme secret Render
- `FIREBASE_PROJECT_ID` : optionnel si `project_id` est déjà présent dans le JSON
- `NOTIFICATION_WORKER_ENABLED=true`

Le compte de service doit disposer du droit d'envoi FCM dans le projet cible. Le serveur obtient un jeton OAuth 2.0 de courte durée avec le scope `https://www.googleapis.com/auth/firebase.messaging`, puis appelle l'API FCM HTTP v1.

Les réponses FCM `UNREGISTERED` provoquent la révocation de l'installation correspondante. Les erreurs 429/5xx restent retryables ; les erreurs d'authentification ou de configuration ne sont pas transformées en succès.

Le payload envoyé au client est un message FCM `data` contenant `template`, `deduplicationKey` et `payload` sérialisé. Le client mobile reste responsable de l'affichage et de l'interprétation du template.
