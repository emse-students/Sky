/**
 * Utilisateur de session resolu cote serveur (`locals.user`) et expose au client
 * via le layout. Issu d une fiche `people` reliee a un compte Authentik.
 */
export interface SessionUser {
  id: string; // people.id (cle des avatars, relations, profil)
  profile_id: string; // alias de id, conserve pour compat avec le code existant
  auth_sub: string | null; // sub Authentik (= id du profil Canari), null si placeholder
  name: string; // "NOM Prenom"
  email: string | null;
  role: "admin" | "user";
  formation: string | null; // 'ICM', 'ISMIN'...
  promo: number | null; // = people.level
  image: string | null;
}
