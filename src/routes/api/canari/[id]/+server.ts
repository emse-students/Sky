import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPersonAuthSub } from "$lib/server/database";
import type { CanariProfile } from "$types/graph";

// URL publique de Canari et cle de l API profil externe (cote serveur uniquement).
const CANARI_API_URL = (
  process.env.CANARI_API_URL || "https://canari-emse.fr"
).replace(/\/+$/, "");
const CANARI_API_KEY = process.env.CANARI_API_KEY;

/**
 * Proxy le profil Canari (bio, associations actuelles/anciennes) d une fiche Sky.
 * Resout d abord le sub Authentik de la fiche (cle commune) ; une fiche
 * placeholder non liee n a pas de profil Canari (`linked: false`). La cle API
 * reste cote serveur ; le client ne recoit que la projection publique.
 */
export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;
  const sub = getPersonAuthSub(id);
  if (!sub) {
    return json({ linked: false });
  }
  if (!CANARI_API_KEY) {
    console.error("[Canari] CANARI_API_KEY non configure");
    return json({ linked: true, error: "unconfigured" });
  }

  try {
    const res = await fetch(
      `${CANARI_API_URL}/api/external/profile/${encodeURIComponent(sub)}`,
      { headers: { "x-api-key": CANARI_API_KEY } },
    );
    if (res.status === 404) {
      return json({ linked: true, profile: null });
    }
    if (!res.ok) {
      console.error(`[Canari] profil ${sub} -> HTTP ${res.status}`);
      return json({ linked: true, error: "upstream" });
    }
    const profile = (await res.json()) as CanariProfile;
    return json({ linked: true, profile });
  } catch (e) {
    console.error("[Canari] echec de recuperation du profil:", e);
    return json({ linked: true, error: "network" });
  }
};
