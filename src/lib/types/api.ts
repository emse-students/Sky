/**
 * Session user resolved server-side (`locals.user`) and exposed to the client
 * via the layout. Derived from a `people` record linked to an Authentik account.
 */
export interface SessionUser {
  id: string; // people.id (key for avatars, relations, profile)
  auth_sub: string | null; // Authentik sub (= Canari profile id), null if placeholder
  name: string; // "LASTNAME Firstname"
  role: 'admin' | 'user';
  formation: string | null; // 'ICM', 'ISMIN'...
  promo: number | null; // = people.level
}
