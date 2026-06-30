import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { timingSafeEqual } from "crypto";
import { getEntourageBySub } from "$lib/server/database";

// Cle de l API publique entrante (Canari -> Sky). Vide = refus de tout appel.
const SKY_API_KEY = process.env.SKY_API_KEY;

/** Comparaison timing-safe d une cle fournie avec SKY_API_KEY. */
function validKey(provided: string | null): boolean {
  if (!SKY_API_KEY || !provided) {
    return false;
  }
  const expected = Buffer.from(SKY_API_KEY);
  const received = Buffer.from(provided);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/**
 * API publique protegee par x-api-key (SKY_API_KEY) : entourage de parrainage
 * d une personne keye par son sub Authentik. Consommee par Canari pour afficher
 * l arbre proche sur la page profil. Exemptee du gate de session (cf.
 * hooks.server.ts) car l authentification est la cle, pas une session ICM.
 */
export const GET: RequestHandler = ({ params, request }) => {
  if (!validKey(request.headers.get("x-api-key"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const { sub } = params;
  return json(getEntourageBySub(sub));
};
