import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { PENDING_COOKIE_NAME } from "$server/link";
import {
  getPendingLink,
  deletePendingLink,
  getLinkCandidates,
  linkPersonAuth,
  createAuthedPerson,
  createSession,
  getPersonIdByAuthSub,
  recalculatePositions,
} from "$server/database";
import { setSessionCookie } from "$server/session";

/**
 * Ecran de choix de liaison : affiche les fiches candidates (meme nom/prenom,
 * non liees) pour que l utilisateur choisisse la sienne ou cree une fiche.
 * Sans demande en attente valide, retour a la connexion.
 */
export const load: PageServerLoad = ({ cookies }) => {
  const token = cookies.get(PENDING_COOKIE_NAME);
  const identity = token ? getPendingLink(token) : null;
  if (!identity) {
    throw redirect(302, "/auth/login");
  }
  return {
    firstName: identity.firstName,
    lastName: identity.lastName,
    level: identity.level,
    candidates: getLinkCandidates(identity.lastName, identity.firstName),
  };
};

export const actions: Actions = {
  default: async ({ cookies, request }) => {
    const token = cookies.get(PENDING_COOKIE_NAME);
    const identity = token ? getPendingLink(token) : null;
    if (!token || !identity) {
      throw redirect(302, "/auth/login");
    }

    const choice = String((await request.formData()).get("choice") ?? "");

    let personId: string;
    let created = false;
    const already = getPersonIdByAuthSub(identity.sub);
    if (already) {
      // Double submit / concurrent login: the fiche is already linked to this sub.
      personId = already;
    } else if (choice === "new") {
      personId = createAuthedPerson(identity);
      created = true;
    } else {
      // The choice must be a STILL-unlinked candidate (anti-race / anti-hijack).
      const candidate = getLinkCandidates(
        identity.lastName,
        identity.firstName,
      ).find((c) => c.id === choice);
      if (!candidate) {
        return fail(400, {
          error: "Ce choix n est plus disponible. Reessaie.",
        });
      }
      linkPersonAuth(candidate.id, identity);
      personId = candidate.id;
    }

    deletePendingLink(token);
    cookies.delete(PENDING_COOKIE_NAME, { path: "/" });
    const session = createSession(personId);
    setSessionCookie(cookies, session.token, session.expiresAt);

    // A newly created fiche needs a position so it shows on the map (best-effort).
    if (created) {
      recalculatePositions().catch((err) =>
        console.error("[LINK] Position recompute failed:", err),
      );
    }
    throw redirect(302, "/");
  },
};
