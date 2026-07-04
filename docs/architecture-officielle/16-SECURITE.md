# Sécurité

## Authentification

JWT obligatoire pour routes protégées. Sessions révocables. Rafraîchissement, expiration, rotation et révocation doivent être documentés dans OpenAPI avant implémentation.

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

