import type { RequestHandler } from './$types';
import {
  getDatabase,
  recalculatePositions,
  setPersonRole,
  unlinkPersonAuth,
} from '#lib/server/database.js';
import { isValidPromo, MIN_PROMO } from '#lib/server/promo.js';
import { formatFirstName, formatLastName } from '#lib/utils/format.js';
import { requireAdmin } from '#lib/server/guards.js';
import { m } from '#lib/paraglide/messages.js';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = params;
  const data = (await request.json()) as {
    prenom: string;
    nom: string;
    level: number | null;
  };

  // Reject typos: no promotion predates the school's founding year (null clears it).
  if (!isValidPromo(data.level)) {
    return Response.json({ error: m.api_promo_invalid({ min: MIN_PROMO }) }, { status: 400 });
  }

  try {
    const db = getDatabase();

    // Identity only: bio and photo come from Canari/MiGallery.
    // Enforce the display convention: "NOM" uppercase, "Prenom" capitalized.
    const updateStmt = db.prepare(`
			UPDATE people
			SET first_name = ?, last_name = ?, level = ?, updated_at = CURRENT_TIMESTAMP
			WHERE id = ?
		`);

    updateStmt.run(formatFirstName(data.prenom), formatLastName(data.nom), data.level, id);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Update person error:', error);
    return Response.json({ error: 'Failed to update person' }, { status: 500 });
  }
};

/**
 * Admin actions on a record: change the role (`set-role`) or unlink the Authentik
 * account (`unlink`, the record becomes a placeholder again). Linking/merging
 * separate records is done via /api/admin/merge.
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAdmin(locals);
  const { id } = params;
  const body = (await request.json()) as {
    action?: string;
    role?: 'user' | 'admin';
  };

  if (body.action === 'set-role') {
    if (body.role !== 'user' && body.role !== 'admin') {
      return Response.json({ error: m.api_invalid_role() }, { status: 400 });
    }
    return setPersonRole(id, body.role)
      ? Response.json({ success: true })
      : Response.json({ error: m.api_fiche_not_found() }, { status: 404 });
  }

  if (body.action === 'unlink') {
    return unlinkPersonAuth(id)
      ? Response.json({ success: true })
      : Response.json({ error: m.api_fiche_not_found() }, { status: 404 });
  }

  return Response.json({ error: m.api_unknown_action() }, { status: 400 });
};

export const DELETE: RequestHandler = ({ params, locals }) => {
  const user = locals.user;
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id } = params;

  try {
    const db = getDatabase();

    // Delete relationships first (foreign key constraint)
    db.prepare('DELETE FROM relationships WHERE source_id = ? OR target_id = ?').run(id, id);

    // Delete person
    db.prepare('DELETE FROM people WHERE id = ?').run(id);

    recalculatePositions().catch(console.error);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Delete person error:', error);
    return Response.json({ error: 'Failed to delete person' }, { status: 500 });
  }
};
