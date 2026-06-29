import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getDatabase,
  recalculatePositions,
  setPersonRole,
  unlinkPersonAuth,
} from "$lib/server/database";
import { requireAdmin } from "$lib/server/guards";

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = params;
  const data = (await request.json()) as {
    prenom: string;
    nom: string;
    level: number | null;
    bio?: string;
    image_url?: string;
  };

  try {
    const db = getDatabase();

    // Update person
    const updateStmt = db.prepare(`
			UPDATE people 
			SET first_name = ?, last_name = ?, level = ?, bio = ?, image_url = ?
			WHERE id = ?
		`);

    updateStmt.run(
      data.prenom,
      data.nom,
      data.level,
      data.bio || null,
      data.image_url || null,
      id,
    );

    return json({ success: true });
  } catch (error) {
    console.error("Update person error:", error);
    return json({ error: "Failed to update person" }, { status: 500 });
  }
};

/**
 * Actions admin sur une fiche : changer le role (`set-role`) ou delier le compte
 * Authentik (`unlink`, la fiche redevient un placeholder). Liaison/fusion de
 * fiches separees se fait via /api/admin/merge.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const { id } = params;
  const body = (await request.json()) as {
    action?: string;
    role?: "user" | "admin";
  };

  if (body.action === "set-role") {
    if (body.role !== "user" && body.role !== "admin") {
      return json({ error: "Role invalide" }, { status: 400 });
    }
    return setPersonRole(id, body.role)
      ? json({ success: true })
      : json({ error: "Fiche introuvable" }, { status: 404 });
  }

  if (body.action === "unlink") {
    return unlinkPersonAuth(id)
      ? json({ success: true })
      : json({ error: "Fiche introuvable" }, { status: 404 });
  }

  return json({ error: "Action inconnue" }, { status: 400 });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = params;

  try {
    const db = getDatabase();

    // Delete relationships first (foreign key constraint)
    db.prepare(
      "DELETE FROM relationships WHERE source_id = ? OR target_id = ?",
    ).run(id, id);

    // Delete external links
    db.prepare("DELETE FROM external_links WHERE person_id = ?").run(id);

    // Delete person
    db.prepare("DELETE FROM people WHERE id = ?").run(id);

    recalculatePositions().catch(console.error);

    return json({ success: true });
  } catch (error) {
    console.error("Delete person error:", error);
    return json({ error: "Failed to delete person" }, { status: 500 });
  }
};
