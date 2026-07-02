import { redirect, fail } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import {
  getLinkCandidates,
  getUnlinkedPeople,
  relinkSelf,
} from "$server/database";
import { SESSION_COOKIE_NAME } from "$server/session";
import { m } from "$lib/paraglide/messages";

/**
 * Account correction screen: shows the fiche the signed-in user is currently
 * attached to, the placeholders that best match their name (likely correct
 * fiche), and the full list of unlinked fiches for a tolerant client-side
 * search. Lets the user move their account to the right fiche after a wrong
 * auto-link.
 */
export const load: PageServerLoad = ({ locals }) => {
  const user = locals.user;
  if (!user) {
    throw redirect(302, "/auth/login");
  }
  const [nom, ...rest] = user.name.split(" ");
  const prenom = rest.join(" ");
  return {
    currentId: user.id,
    currentName: user.name,
    // Best-guess placeholders for this identity (exact, else fuzzy), reshaped to
    // the {prenom, nom} shape the page uses (getLinkCandidates yields first/last).
    suggested: getLinkCandidates(nom, prenom).map((c) => ({
      id: c.id,
      prenom: c.firstName,
      nom: c.lastName,
      level: c.level,
    })),
    unlinked: getUnlinkedPeople(),
  };
};

export const actions: Actions = {
  relink: async ({ cookies, request, locals }) => {
    const user = locals.user;
    const token = cookies.get(SESSION_COOKIE_NAME);
    if (!user || !token) {
      throw redirect(302, "/auth/login");
    }
    const targetId = String((await request.formData()).get("targetId") ?? "");
    if (!targetId) {
      return fail(400, { error: m.account_no_fiche_selected() });
    }
    const ok = relinkSelf(user.id, targetId, token);
    if (!ok) {
      return fail(400, { error: m.account_fiche_unavailable() });
    }
    throw redirect(302, "/");
  },
};
