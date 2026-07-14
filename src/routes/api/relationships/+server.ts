import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getDatabase,
  recalculatePositions,
  addParrainage,
  removeRelationshipById,
  getRelationshipById,
  findPeopleByName,
  createPlaceholderPerson,
  getPersonById,
  getPersonAuthSub,
  countPersonRelations,
  isRelationKind,
  isSameFamily,
  isValidPromo,
  MIN_PROMO,
  RelationError,
  type RelationKind,
} from "$lib/server/database";
import { m } from "$lib/paraglide/messages";

/** Raw list of links (read). */
export const GET: RequestHandler = () => {
  try {
    const db = getDatabase();
    const relationships = db.prepare("SELECT * FROM relationships").all();
    return json(relationships);
  } catch (error) {
    console.error("Error fetching relationships:", error);
    return json({ error: "Failed to fetch relationships" }, { status: 500 });
  }
};

/** Description of a record to create (an entourage member not yet in the DB). */
interface NewPersonInput {
  firstName?: string;
  lastName?: string;
  level?: number | string | null;
}

/** Expected body for adding an entourage link. */
interface AddRelationBody {
  type?: string;
  role?: "parrain" | "fillot";
  targetId?: string;
  newPerson?: NewPersonInput;
  confirmCreate?: boolean;
  /** Person at the center of the link (default: the user). Admin required otherwise. */
  centerId?: string;
}

/** Coerce a promo (number | string) to an integer, or null. */
function parseLevel(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Add an entourage link for the signed-in user (their node = `me`).
 * `role=parrain` -> the other is my godparent (other -> me); `role=fillot` ->
 * the other is my godchild (me -> other). The other is either an existing record
 * (`targetId`) or a new record (`newPerson`); in the latter case, if namesakes
 * exist and `confirmCreate` is false, the candidates are returned to offer a link
 * rather than a duplicate. The 1/1/3/2 rules and the anti-cycle constraint are
 * enforced by the engine (`addParrainage`).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.profile_id) {
    return json({ error: m.api_unauthenticated() }, { status: 401 });
  }

  const body = (await request.json()) as AddRelationBody;
  const {
    type,
    role = "fillot",
    targetId,
    newPerson,
    confirmCreate,
    centerId,
  } = body;

  if (!isRelationKind(type)) {
    return json({ error: m.api_invalid_relation_type() }, { status: 400 });
  }
  const kind: RelationKind = type;

  // Center of the link: oneself by default. A user may also edit any node of
  // their own parrainage family (same connected component); an admin, anyone.
  const center = centerId ?? user.profile_id;
  if (
    center !== user.profile_id &&
    user.role !== "admin" &&
    !isSameFamily(user.profile_id, center)
  ) {
    return json({ error: m.api_unauthorized() }, { status: 403 });
  }

  // Resolve the other end of the link: existing record or new one (dedup).
  let otherId: string;
  if (targetId) {
    otherId = targetId;
  } else if (newPerson?.firstName && newPerson?.lastName) {
    const level = parseLevel(newPerson.level);
    // Promo is mandatory when creating a new star.
    if (level === null) {
      return json({ error: m.api_promo_required() }, { status: 400 });
    }
    // Reject typos: no promotion predates the school's founding year.
    if (!isValidPromo(level)) {
      return json(
        { error: m.api_promo_invalid({ min: MIN_PROMO }) },
        { status: 400 },
      );
    }
    if (!confirmCreate) {
      const candidates = findPeopleByName(
        newPerson.lastName,
        newPerson.firstName,
      );
      if (candidates.length > 0) {
        return json({ needsConfirmation: true, candidates }, { status: 409 });
      }
    }
    otherId = createPlaceholderPerson(
      newPerson.firstName,
      newPerson.lastName,
      level,
      user.profile_id,
    );
  } else {
    return json({ error: m.api_target_or_new_required() }, { status: 400 });
  }

  // parrain = source, fillot = target (relative to the central person).
  const sourceId = role === "parrain" ? otherId : center;
  const targetUser = role === "parrain" ? center : otherId;

  try {
    addParrainage(sourceId, targetUser, kind);
  } catch (error) {
    if (error instanceof RelationError) {
      return json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Error creating relationship:", error);
    return json({ error: m.api_relation_create_failed() }, { status: 500 });
  }

  // Recompute positions in the background (best effort).
  recalculatePositions().catch((err) =>
    console.error("Failed to recalculate positions:", err),
  );

  return json({ success: true, personId: otherId });
};

/**
 * Remove an entourage link. Allowed when either endpoint belongs to the user's
 * own parrainage family (same connected component), or for an admin on any link.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.profile_id) {
    return json({ error: m.api_unauthenticated() }, { status: 401 });
  }

  const body = (await request.json()) as { relationshipId?: number };
  const { relationshipId } = body;
  if (!relationshipId) {
    return json({ error: m.api_relationship_id_missing() }, { status: 400 });
  }

  const rel = getRelationshipById(relationshipId);
  if (!rel) {
    return json({ error: m.api_relationship_not_found() }, { status: 404 });
  }

  const touchesMyFamily =
    isSameFamily(user.profile_id, rel.source_id) ||
    isSameFamily(user.profile_id, rel.target_id);
  if (!touchesMyFamily && user.role !== "admin") {
    return json({ error: m.api_unauthorized() }, { status: 403 });
  }

  removeRelationshipById(relationshipId);

  recalculatePositions().catch((err) =>
    console.error("Failed to recalculate positions:", err),
  );

  // If removing this link left a placeholder star with no relations at all, it
  // is likely a mistake (e.g. a mistyped name recreated elsewhere): offer to
  // delete that orphan rather than leave it dangling.
  let orphan: { id: string; prenom: string; nom: string } | null = null;
  for (const endId of [rel.source_id, rel.target_id]) {
    if (getPersonAuthSub(endId) === null && countPersonRelations(endId) === 0) {
      const p = getPersonById(endId);
      if (p) {
        orphan = { id: p.id, prenom: p.prenom, nom: p.nom };
        break;
      }
    }
  }

  return json({ success: true, orphan });
};
