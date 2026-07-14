import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getDatabase,
  recalculatePositions,
  getAllPeopleAdmin,
  isValidPromo,
  MIN_PROMO,
} from "$lib/server/database";
import { formatFirstName, formatLastName } from "$lib/utils/format";
import { requireAdmin } from "$lib/server/guards";
import { m } from "$lib/paraglide/messages";

/** Enriched list (role, account link status) for administration. */
export const GET: RequestHandler = ({ locals }) => {
  requireAdmin(locals);
  return json(getAllPeopleAdmin());
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user || user.role !== "admin") {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  const data = (await request.json()) as {
    id: string;
    prenom: string;
    nom: string;
    level: number | null;
  };

  try {
    const db = getDatabase();

    // Check if ID already exists
    const existing = db
      .prepare("SELECT id FROM people WHERE id = ?")
      .get(data.id);
    if (existing) {
      return json({ error: "ID already exists" }, { status: 400 });
    }

    // Enforce the display convention: "NOM" uppercase, "Prenom" capitalized.
    const prenom = formatFirstName(data.prenom);
    const nom = formatLastName(data.nom);

    // Last name, first name and class are mandatory when creating a star.
    if (!prenom || !nom || data.level === null || data.level === undefined) {
      return json({ error: m.modal_required_fields() }, { status: 400 });
    }
    // Reject typos: no promotion predates the school's founding year.
    if (!isValidPromo(data.level)) {
      return json(
        { error: m.api_promo_invalid({ min: MIN_PROMO }) },
        { status: 400 },
      );
    }

    // Insert person
    const insertStmt = db.prepare(`
			INSERT INTO people (id, first_name, last_name, level, image_url)
			VALUES (?, ?, ?, ?, ?)
		`);

    insertStmt.run(data.id, prenom, nom, data.level, "default.jpg");

    recalculatePositions().catch(console.error);

    return json({ success: true, id: data.id });
  } catch (error) {
    console.error("Create person error:", error);
    return json({ error: "Failed to create person" }, { status: 500 });
  }
};
