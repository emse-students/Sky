import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import { PENDING_COOKIE_NAME } from "$server/link";
import {
  getPendingLink,
  deletePendingLink,
  findUnlinkedCandidatesByName,
  linkPersonAuth,
  createAuthedPerson,
  createSession,
  getPersonIdByAuthSub,
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
    candidates: findUnlinkedCandidatesByName(
      identity.lastName,
      identity.firstName,
    ),
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
    const already = getPersonIdByAuthSub(identity.sub);
    if (already) {
      // Double soumission / login concurrent : la fiche est deja liee a ce sub.
      personId = already;
    } else if (choice === "new") {
      personId = createAuthedPerson(identity);
    } else {
      // Le choix doit etre un candidat TOUJOURS non lie (anti-race / anti-vol).
      const candidate = findUnlinkedCandidatesByName(
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
    throw redirect(302, "/");
  },
};
