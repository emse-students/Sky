import { json } from "@sveltejs/kit";
import {
  mergePeople,
  recalculatePositions,
  getPersonAuthSub,
  isValidPromo,
  MIN_PROMO,
} from "$lib/server/database";
import type { RequestHandler } from "@sveltejs/kit";
import { m } from "$lib/paraglide/messages";

/** Chosen identity to keep when the two fiches disagree (nom/prenom/promo). */
interface MergeResolution {
  prenom?: string;
  nom?: string;
  level?: number | null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      sourceId: string;
      targetId: string;
      resolution?: MergeResolution;
    };
    const { sourceId, targetId, resolution } = body;

    if (!sourceId || !targetId) {
      return json({ error: "Missing sourceId or targetId" }, { status: 400 });
    }

    if (sourceId === targetId) {
      return json(
        { error: "Cannot merge person into themselves" },
        { status: 400 },
      );
    }

    // "One star = one person" lock: never merge two fiches linked to an
    // Authentik account (they would be two distinct physical people).
    const sourceLinked = getPersonAuthSub(sourceId) !== null;
    const targetLinked = getPersonAuthSub(targetId) !== null;
    if (sourceLinked && targetLinked) {
      return json({ error: m.api_merge_two_linked() }, { status: 409 });
    }

    // The linked fiche (connected account) always survives, whatever the
    // selection order: it becomes the target that inherits the other's links.
    const keepId = sourceLinked ? sourceId : targetId;
    const removeId = sourceLinked ? targetId : sourceId;

    // Optional identity resolution: the admin chose which fiche's data to keep
    // when they differ. Validate the chosen promo like any other creation/edit.
    let survivorIdentity:
      | { prenom: string; nom: string; level: number | null }
      | undefined;
    if (resolution?.prenom && resolution?.nom) {
      const level =
        typeof resolution.level === "number" ? resolution.level : null;
      if (level !== null && !isValidPromo(level)) {
        return json(
          { error: m.api_promo_invalid({ min: MIN_PROMO }) },
          { status: 400 },
        );
      }
      survivorIdentity = {
        prenom: resolution.prenom,
        nom: resolution.nom,
        level,
      };
    }

    mergePeople(removeId, keepId, survivorIdentity);

    // Trigger recalculation in background
    recalculatePositions().catch((e) => console.error("Recalc failed", e));

    return json({ success: true, survivorId: keepId });
  } catch (error) {
    console.error("Merge failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: "Merge failed", details: message }, { status: 500 });
  }
};
