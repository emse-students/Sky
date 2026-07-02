import type { LayoutServerLoad } from "./$types";

// Canari public base (same domain as the profile API) to build client-side
// "Profile" links: <canariUrl>/profile/<sub>.
const CANARI_URL = (
  process.env.CANARI_API_URL || "https://canari-emse.fr"
).replace(/\/+$/, "");

export const load: LayoutServerLoad = ({ locals }) => {
  return {
    user: locals.user || null,
    canariUrl: CANARI_URL,
  };
};
