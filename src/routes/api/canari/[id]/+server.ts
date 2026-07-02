import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getPersonAuthSub } from "$lib/server/database";
import type { CanariProfile } from "$types/graph";

// Canari public URL and external-profile API key (server-side only).
const CANARI_API_URL = (
  process.env.CANARI_API_URL || "https://canari-emse.fr"
).replace(/\/+$/, "");
const CANARI_API_KEY = process.env.CANARI_API_KEY;

/** Resolves a club logo to an absolute URL (relative path -> Canari domain). */
function resolveCanariLogo(logoUrl: string | null): string | null {
  const u = logoUrl?.trim();
  if (!u) {
    return null;
  }
  return u.startsWith("/") ? `${CANARI_API_URL}${u}` : u;
}

/**
 * Proxies the Canari profile (bio, current/former clubs) of a Sky record.
 * First resolves the record's Authentik sub (shared key); an unlinked
 * placeholder record has no Canari profile (`linked: false`). The API key stays
 * server-side; the client only receives the public projection.
 */
export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;
  const sub = getPersonAuthSub(id);
  if (!sub) {
    return json({ linked: false });
  }
  if (!CANARI_API_KEY) {
    console.error("[Canari] CANARI_API_KEY not configured");
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
      console.error(`[Canari] profile ${sub} -> HTTP ${res.status}`);
      return json({ linked: true, error: "upstream" });
    }
    const profile = (await res.json()) as CanariProfile;
    // Resolve club logos to absolute URLs (logoUrl = same-origin path
    // `/api/media/public/:id` on Canari, public and unauthenticated).
    profile.associations = (profile.associations ?? []).map((a) => ({
      ...a,
      logo: resolveCanariLogo(a.logoUrl),
    }));
    profile.formerAssociations = (profile.formerAssociations ?? []).map(
      (a) => ({
        ...a,
        logo: resolveCanariLogo(a.logoUrl),
      }),
    );
    return json({ linked: true, profile });
  } catch (e) {
    console.error("[Canari] profile fetch failed:", e);
    return json({ linked: true, error: "network" });
  }
};
