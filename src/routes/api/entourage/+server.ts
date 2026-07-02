import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getPersonById,
  getEntourage,
  isSameFamily,
  MAX_PARRAINS,
  MAX_FILLOTS,
} from "$lib/server/database";

/**
 * Direct entourage of a person (incoming parrains, outgoing fillots) for the
 * tree editor. `?id=` targets a record; defaults to the signed-in user. Also
 * returns the per-type maxima to draw the right number of slots, and `canEdit`:
 * whether the requester may edit this tree (admin, or same parrainage family).
 */
export const GET: RequestHandler = ({ url, locals }) => {
  const id = url.searchParams.get("id") ?? locals.user?.profile_id ?? null;
  if (!id) {
    return json({ error: "Aucune personne ciblee" }, { status: 400 });
  }

  const person = getPersonById(id);
  if (!person) {
    return json({ error: "Personne introuvable" }, { status: 404 });
  }

  const user = locals.user;
  const canEdit =
    !!user &&
    (user.role === "admin" ||
      (!!user.profile_id && isSameFamily(user.profile_id, id)));

  const { parrains, fillots } = getEntourage(id);
  return json({
    person: {
      id: person.id,
      prenom: person.prenom,
      nom: person.nom,
      level: person.level,
    },
    parrains,
    fillots,
    maxParrains: MAX_PARRAINS,
    maxFillots: MAX_FILLOTS,
    canEdit,
  });
};
