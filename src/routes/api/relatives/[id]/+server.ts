import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  isSameFamily,
  updatePlaceholderIdentity,
  deletePlaceholderPerson,
  countPersonRelations,
  recalculatePositions,
} from "$lib/server/database";

/**
 * Edit or delete a placeholder relative (a parrain/fillot not yet linked to a
 * real account). Allowed for an admin, or for the signed-in user when the target
 * belongs to their own parrainage family (same connected component) - so a user
 * can fix a mistyped name or remove a wrong star anywhere in their tree. Real
 * accounts are protected by the DB layer (identity owned by MiConnect).
 */
function canManage(
  locals: App.Locals,
  id: string,
): boolean {
  const user = locals.user;
  if (!user) {
    return false;
  }
  if (user.role === "admin") {
    return true;
  }
  return !!user.profile_id && isSameFamily(user.profile_id, id);
}

/** Coerce a JSON promo value to a positive integer, or null. */
function parseLevel(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!canManage(locals, params.id)) {
    return json({ error: "Non autorisé" }, { status: 403 });
  }
  const data = (await request.json()) as {
    prenom?: string;
    nom?: string;
    level?: number | string | null;
  };
  const level = parseLevel(data.level);
  if (!data.prenom?.trim() || !data.nom?.trim() || level === null) {
    return json(
      { error: "Nom, prénom et promotion sont obligatoires." },
      { status: 400 },
    );
  }
  const ok = updatePlaceholderIdentity(params.id, data.prenom, data.nom, level);
  if (!ok) {
    return json(
      { error: "Fiche introuvable ou reliée à un compte." },
      { status: 409 },
    );
  }
  return json({ success: true });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  // Allow deleting an orphan placeholder (no relation at all, so unowned) by any
  // signed-in user: this is the "délier -> the star is now dangling" cleanup.
  const orphan =
    !!locals.user && countPersonRelations(params.id) === 0;
  if (!canManage(locals, params.id) && !orphan) {
    return json({ error: "Non autorisé" }, { status: 403 });
  }
  const ok = deletePlaceholderPerson(params.id);
  if (!ok) {
    return json(
      { error: "Fiche introuvable ou reliée à un compte." },
      { status: 409 },
    );
  }
  recalculatePositions().catch((e) => console.error("Recalc failed", e));
  return json({ success: true });
};
