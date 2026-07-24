# Modele d'identifiants Sky

Sky distingue deux types de fiches `people`, identifiees par leur cle primaire
`id` (TEXT) :

## 1. Fiches placeholder (sans compte)

- `id` = `prenom.nom[.promo][.idx]` (slug ASCII, sans accents), genere par
  `generatePersonId` (cf. `src/lib/server/database.ts`). En cas de collision :
  ajout de `.promo` puis d'un index `.idx`.
- Creees quand un utilisateur ajoute un membre d'entourage qui n'a pas encore de
  fiche (`createPlaceholderPerson`, champ `created_by` = auteur).
- `auth_sub` est `NULL`. Pas de photo MiGallery, pas de profil Canari.
- L'`id` est stable : il ne change jamais apres creation.

## 2. Fiches de compte (liees a Authentik)

- `id` = le `sub` Authentik (claim OIDC). Creees a la premiere connexion quand
  aucune fiche existante ne correspond (`createAuthedPerson`).
- `auth_sub` = `sub` (index unique partiel : un seul compte par fiche). Sert
  aussi de cle pour la photo MiGallery (`/api/avatar/{auth_sub}`) et pour le
  profil Canari (`/api/external/profile/{sub}`).

## Liaison

A la connexion (`resolveLogin`) :

1. `auth_sub` deja connu -> rafraichit l'identite, ouvre la session.
2. 1 seul homonyme (nom + prenom) avec promo concordante -> liaison automatique.
3. aucun homonyme -> creation d'une fiche de compte (id = sub).
4. plusieurs candidats / doute -> ecran de choix (`/auth/link`).

Un compte = une personne : on ne peut pas reclamer une fiche deja liee. Un admin
peut delier (`unlinkPersonAuth`, la fiche redevient un placeholder) ou fusionner
deux fiches (`mergePeople`, conserve les liens de parrainage).

## Perimetre des donnees

Sky n'est la source de verite que pour les **liens de parrainage**
(`relationships`, regles 1 parrain officiel / 1 adoption / 3 fillots officiels /
2 adoption, sans cycle). Le reste du profil (bio, associations actuelles et
anciennes) provient de **Canari** via l'API publique, keye par le `sub`
(cf. `/api/canari/[id]`). Les colonnes/tables historiques `bio`, `external_links`
et `associations` ne sont plus alimentees cote Sky (donnees conservees dans le
snapshot `sky-legacy.db`).
