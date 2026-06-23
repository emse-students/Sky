/**
 * Gardes d acces serveur partagees. Centralise la verification du role admin
 * pour les endpoints et loads `/api/admin/*` et `/admin/*` (source de verite :
 * `people.role`, cf. hooks.server.ts).
 */
import { error } from "@sveltejs/kit";
import type { SessionUser } from "$types/api";

/** Exige une session admin, sinon 403. Retourne l utilisateur pour confort. */
export function requireAdmin(locals: App.Locals): SessionUser {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    throw error(403, "Reserve aux administrateurs");
  }
  return user;
}
