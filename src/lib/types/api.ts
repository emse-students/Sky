/**
 * Session user resolved server-side (`locals.user`) and exposed to the client
 * via the layout. Derived from a `people` record linked to an Authentik account.
 */
export interface SessionUser {
  id: string; // people.id (key for avatars, relations, profile)
  profile_id: string; // alias of id, kept for compatibility with existing code
  auth_sub: string | null; // Authentik sub (= Canari profile id), null if placeholder
  name: string; // "LASTNAME Firstname"
  email: string | null;
  role: "admin" | "user";
  formation: string | null; // 'ICM', 'ISMIN'...
  promo: number | null; // = people.level
  image: string | null;
}
