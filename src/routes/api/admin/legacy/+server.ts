import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$server/guards";
import {
  legacyExists,
  getLegacyCounts,
  getLegacyPeople,
  getLegacyPersonRelations,
} from "$server/database";

/**
 * Consultation lecture seule de l ancienne base (snapshot `sky-legacy.db`),
 * pour reconstruire les donnees a la main. `?id=` renvoie les relations d une
 * fiche ; sinon liste de personnes filtrable via `?q=` + compteurs.
 */
export const GET: RequestHandler = ({ locals, url }) => {
  requireAdmin(locals);

  const id = url.searchParams.get("id");
  if (id) {
    return json({ relations: getLegacyPersonRelations(id) });
  }

  const q = url.searchParams.get("q") ?? "";
  return json({
    exists: legacyExists(),
    counts: getLegacyCounts(),
    people: getLegacyPeople(q),
  });
};
