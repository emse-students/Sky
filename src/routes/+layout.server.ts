import type { LayoutServerLoad } from "./$types";

// Base publique de Canari (meme domaine que l API profil) pour construire les
// liens "Profil" cote client : <canariUrl>/profile/<sub>.
const CANARI_URL = (
  process.env.CANARI_API_URL || "https://canari-emse.fr"
).replace(/\/+$/, "");

export const load: LayoutServerLoad = ({ locals }) => {
  return {
    user: locals.user || null,
    canariUrl: CANARI_URL,
  };
};
