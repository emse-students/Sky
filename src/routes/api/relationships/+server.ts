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
  isRelationKind,
  RelationError,
  type RelationKind,
} from "$lib/server/database";

/** Liste brute des liens (lecture). */
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

/** Description d une fiche a creer (membre d entourage inexistant en base). */
interface NewPersonInput {
  firstName?: string;
  lastName?: string;
  level?: number | string | null;
}

/** Corps attendu pour l ajout d un lien d entourage. */
interface AddRelationBody {
  type?: string;
  role?: "parrain" | "fillot";
  targetId?: string;
  newPerson?: NewPersonInput;
  confirmCreate?: boolean;
  /** Personne au centre du lien (defaut: l utilisateur). Admin requis si autre. */
  centerId?: string;
}

/** Convertit une promo (number | string) en entier, sinon null. */
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
 * Ajoute un lien d entourage pour l utilisateur connecte (son nœud = `me`).
 * `role=parrain` -> l autre est mon parrain (autre -> me) ; `role=fillot` ->
 * l autre est mon fillot (me -> autre). L autre est soit une fiche existante
 * (`targetId`), soit une nouvelle fiche (`newPerson`) ; dans ce dernier cas, si
 * des homonymes existent et que `confirmCreate` est faux, on renvoie les
 * candidats pour proposer une liaison plutot qu un doublon. Les regles 1/1/3/2
 * et l anti-cycle sont appliquees par le moteur (`addParrainage`).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.profile_id) {
    return json({ error: "Non authentifie" }, { status: 401 });
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
    return json({ error: "Type de lien invalide" }, { status: 400 });
  }
  const kind: RelationKind = type;

  // Personne au centre du lien : soi-meme par defaut, ou n importe qui en admin
  // (edition de l entourage d autrui depuis l arbre).
  const center = centerId ?? user.profile_id;
  if (center !== user.profile_id && user.role !== "admin") {
    return json({ error: "Non autorise" }, { status: 403 });
  }

  // Resoudre l autre extremite du lien : fiche existante ou nouvelle (dedup).
  let otherId: string;
  if (targetId) {
    otherId = targetId;
  } else if (newPerson?.firstName && newPerson?.lastName) {
    const level = parseLevel(newPerson.level);
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
    return json({ error: "targetId ou newPerson requis" }, { status: 400 });
  }

  // parrain = source, fillot = target (relatif a la personne centrale).
  const sourceId = role === "parrain" ? otherId : center;
  const targetUser = role === "parrain" ? center : otherId;

  try {
    addParrainage(sourceId, targetUser, kind);
  } catch (error) {
    if (error instanceof RelationError) {
      return json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Error creating relationship:", error);
    return json({ error: "Echec de creation du lien" }, { status: 500 });
  }

  // Recalcul des positions en tache de fond (meilleur effort).
  recalculatePositions().catch((err) =>
    console.error("Failed to recalculate positions:", err),
  );

  return json({ success: true, personId: otherId });
};

/**
 * Supprime un lien d entourage. Reserve a un lien touchant l utilisateur
 * (parrain ou fillot), sauf pour un admin qui peut retirer n importe quel lien.
 */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || !user.profile_id) {
    return json({ error: "Non authentifie" }, { status: 401 });
  }

  const body = (await request.json()) as { relationshipId?: number };
  const { relationshipId } = body;
  if (!relationshipId) {
    return json({ error: "relationshipId manquant" }, { status: 400 });
  }

  const rel = getRelationshipById(relationshipId);
  if (!rel) {
    return json({ error: "Lien introuvable" }, { status: 404 });
  }

  const touchesMe =
    rel.source_id === user.profile_id || rel.target_id === user.profile_id;
  if (!touchesMe && user.role !== "admin") {
    return json({ error: "Non autorise" }, { status: 403 });
  }

  removeRelationshipById(relationshipId);

  recalculatePositions().catch((err) =>
    console.error("Failed to recalculate positions:", err),
  );

  return json({ success: true });
};
