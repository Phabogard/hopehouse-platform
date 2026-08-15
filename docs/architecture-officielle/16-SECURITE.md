# Sécurité

## Authentification

JWT obligatoire pour routes protégées. Sessions révocables. Rafraîchissement, expiration, rotation et révocation doivent être documentés dans OpenAPI avant implémentation complète des domaines concernés.

## RBAC

Permissions configurables vérifiées côté serveur. Aucun écran ou bouton sensible ne suffit sans contrôle API.

## Appareils

Empreinte appareil, journal des appareils, appareil inconnu, révocation appareil et confirmation renforcée sont configurables.

## Connexions

blocage après 4 tentatives échouées. Délai configurable, 24 h par défaut. Déblocage par règle configurée ou Super Admin autorisé. Journal de connexion obligatoire : utilisateur, appareil, IP si disponible, résultat, date, motif.

## Comptes en double

La détection des comptes multiples Hope House utilise des règles configurées : identité, téléphone, document, appareil, biométrie si légalement validée ou autres signaux. Les doublons sont signalés, pas fusionnés automatiquement sans règle.

## Double authentification

2FA configurable par rôle, risque, action ou utilisateur. Actions critiques : Login As, correction wallet, export financier, changement RBAC, réinitialisation sécurité.

## Audit sécurité

Connexions, échecs, blocages, déblocages, appareils, 2FA, réinitialisations, Login As et consultations sensibles sont audités.

## Statut normatif

Ce document appartient au corpus officiel Hope House Platform. Il est obligatoire pour toute analyse, conception, développement, test, revue et fusion.

## Garde-fous permanents

Moteur universel, configuration dynamique, wallets numériques, RBAC configurable, connecteurs indépendants, audit complet et compatibilité ascendante sont obligatoires.

## Architecture Authentification & Sécurité — Lot 1 contractuel

Le Lot 1 établit le contrat des composants d'authentification et de sécurité et fournit désormais un premier socle runtime. La persistance PostgreSQL complète et les domaines non encore migrés restent des étapes ultérieures. Prisma ORM est le modèle de référence pour la persistance et les futures migrations versionnées; Neon est uniquement un fournisseur PostgreSQL.

### Paramètres configurables

Tous les paramètres de sécurité sont administrés via `app_settings`, source unique des paramètres configurables. Aucune table `security_policies` séparée n'est créée afin d'éviter la duplication. Les valeurs comme durée d'access token, durée de refresh token, seuil de blocage, délai de blocage, expiration de challenge 2FA et règles de révocation sont des paramètres configurables, pas des constantes métier codées en dur.

### Cycle d'authentification cible

1. L'utilisateur soumet identifiant, secret et contexte appareil.
2. Le système vérifie les règles configurées dans `app_settings`.
3. Les tentatives sont journalisées dans `login_attempts`.
4. L'appareil est rapproché de `device_fingerprints`.
5. Si la politique configurable l'exige, un challenge 2FA est créé.
6. En succès, une session révocable est créée dans `login_sessions`.
7. Un access token court est émis et un refresh token rotatif est remis au client.
8. Le refresh token est stocké côté serveur uniquement sous forme d'empreinte hashée dans `session_refresh_tokens`.
9. Les événements sensibles sont enregistrés dans `security_events` et auditables via `audit_logs`.

### Cycle des refresh tokens

Les refresh tokens sont obligatoirement rotatifs. À chaque rafraîchissement accepté, le refresh token précédent est marqué comme `rotated`, un nouveau refresh token est émis et seule son empreinte hashée est conservée. La réutilisation d'un refresh token déjà remplacé est un événement critique et entraîne la révocation configurable de la session ou de la famille de tokens. La révocation peut être globale, par session ou par appareil.

### Révocation globale et révocation par appareil

La révocation globale invalide toutes les sessions actives d'un utilisateur selon une règle configurée. La révocation par appareil invalide les sessions liées à un `device_fingerprint_id`. Les actions administratives de révocation exigent justification, permissions configurables et audit.

### Durées documentées comme valeurs configurables

Les valeurs de référence sont : access token 15 minutes, refresh token 30 jours, expiration d'inactivité 7 jours, expiration absolue de session 30 jours, challenge 2FA 5 minutes et token de réinitialisation 15 minutes. Ces valeurs sont des paramètres `app_settings` modifiables; elles ne doivent pas être codées en dur dans la logique métier.

### Prisma et Neon PostgreSQL

PostgreSQL reste la cible de persistance. Prisma ORM est le modèle de référence et la future source des migrations versionnées; Neon est uniquement le fournisseur PostgreSQL. Aucun domaine métier ne dépend de Neon. Les secrets, URL de connexion, clés JWT, paramètres 2FA et chaînes de connexion ne sont jamais versionnés.

## Implémentation Phase 1A — Authentification JWT et sessions

La Phase 1A implémente un premier socle runtime sans attendre la persistance PostgreSQL complète. Elle introduit l'émission et la vérification d'access tokens signés, la création de sessions révocables via le module `auth-security`, l'émission de refresh tokens par le service existant et l'endpoint `POST /auth/login`.

Les repositories utilisés par cette phase restent in-memory et transitoires pour les domaines non encore migrés vers PostgreSQL. Ils implémentent les interfaces du module `auth-security` afin d'être remplacés par des repositories PostgreSQL lors de la phase de persistance sans modifier la logique métier. Les secrets JWT et le mot de passe bootstrap doivent être fournis par configuration ou injection de test; aucun secret de production ne doit être versionné.

Le RBAC reste statique pendant cette phase et sera remplacé par le RBAC dynamique en Phase 4. Les acteurs de démonstration restent uniquement pour les routes non encore migrées; leur suppression définitive est prévue en Phase 1D.

## Contrat runtime Auth/Security via app_settings

La politique runtime Auth/Security est résolue depuis `ConfigurationService` et `app_settings` avec l'identité stricte suivante : namespace `auth-security`, key `runtime-policy`, scopeType `global`, scopeId `null`. Le contrat PostgreSQL garantit cette unicité globale au niveau base par un index unique `NULLS NOT DISTINCT`, et pas uniquement par une règle applicative. Les scopes client, utilisateur ou tenant sont des préférences ou des paramètres de périmètre et ne peuvent pas remplacer cette politique système obligatoire.

La valeur JSON attendue est un objet partiel dont les champs autorisés sont ceux du contrat `AuthSecurityPolicy` existant : `accessTokenTtlMs`, `refreshTokenTtlMs`, `sessionAbsoluteTtlMs`, `sessionIdleTtlMs`, `passwordResetTokenTtlMs`, `twoFactorChallengeTtlMs`, `twoFactorMaxAttempts`, `loginBlockThreshold`, `blockDurationMs`, `requireTwoFactor` et `refreshTokenReuseAction`. Aucun secret, rôle, identifiant demandeur ou paramètre HTTP ne fait partie de ce contrat.

Règles d'applicabilité : seul un enregistrement `active`, non futur, non expiré, de valeur JSON objet, et correspondant exactement au scope global est applicable. Une configuration absente, `draft`, `archived`, future, expirée, de mauvais scope ou de forme invalide est ignorée et le fallback sûr transitoire est conservé.

Bornes runtime acceptées : access token de 5 à 60 minutes; refresh token de 1 heure à 30 jours; session absolue de 1 heure à 30 jours; session idle `null` ou de 15 minutes à 7 jours; token de réinitialisation de 5 à 60 minutes; challenge 2FA de 1 à 10 minutes; tentatives 2FA de 1 à 5; seuil de blocage login de 1 à 10; durée de blocage de 15 minutes à 7 jours. `refreshTokenReuseAction` accepte uniquement `revoke_session` ou `revoke_user_sessions` depuis `app_settings`; `record_only` reste un type historique/test mais n'est pas accepté comme politique persistée. `requireTwoFactor` peut renforcer la politique mais ne peut pas être abaissé lorsqu'un fallback serveur l'impose déjà.

Le fallback sûr transitoire reste la politique par défaut du runtime Auth/Security existant. Une valeur persistée invalide ne produit pas de politique permissive et ne doit pas exposer la valeur fautive dans les logs, erreurs ou réponses. Les préférences client/utilisateur ne peuvent jamais désactiver 2FA imposée, diminuer les règles de session, modifier les règles de blocage, ni affaiblir la rotation ou la réaction à la réutilisation des refresh tokens.
