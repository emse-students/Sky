import { json } from "@sveltejs/kit";
import {
  mergePeople,
  recalculatePositions,
  getPersonAuthSub,
} from "$lib/server/database";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      sourceId: string;
      targetId: string;
    };
    const { sourceId, targetId } = body;

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
      return json(
        {
          error:
            "Impossible de fusionner deux comptes reliés : une étoile = une personne.",
        },
        { status: 409 },
      );
    }

    // The linked fiche (connected account) always survives, whatever the
    // selection order: it becomes the target that inherits the other's links.
    const keepId = sourceLinked ? sourceId : targetId;
    const removeId = sourceLinked ? targetId : sourceId;
    mergePeople(removeId, keepId);

    // Trigger recalculation in background
    recalculatePositions().catch((e) => console.error("Recalc failed", e));

    return json({ success: true, survivorId: keepId });
  } catch (error) {
    console.error("Merge failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return json({ error: "Merge failed", details: message }, { status: 500 });
  }
};
