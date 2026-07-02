/**
 * Shared server-side access guards. Centralizes the admin-role check for the
 * `/api/admin/*` and `/admin/*` endpoints and loads (source of truth:
 * `people.role`, see hooks.server.ts).
 */
import { error } from "@sveltejs/kit";
import type { SessionUser } from "$types/api";
import { m } from "$lib/paraglide/messages";

/** Require an admin session, else 403. Returns the user for convenience. */
export function requireAdmin(locals: App.Locals): SessionUser {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    throw error(403, m.api_admin_only());
  }
  return user;
}
