import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getPersonById,
  getEntourage,
  MAX_PARRAINS,
  MAX_FILLOTS,
} from "$lib/server/database";

/**
 * Entourage direct d une personne (parrains entrants, fillots sortants) pour
 * l editeur d arbre. `?id=` cible une fiche ; par defaut, l utilisateur connecte.
 * Renvoie aussi les maxima par type pour dessiner le bon nombre de slots.
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
  });
};
