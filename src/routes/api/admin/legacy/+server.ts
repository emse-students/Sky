import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAdmin } from "$server/guards";
import {
  legacyExists,
  getLegacyCounts,
  getLegacyPeople,
  getLegacyPersonRelations,
} from "$server/database";

/**
 * Read-only browsing of the legacy database (snapshot `sky-legacy.db`), to
 * rebuild data by hand. `?id=` returns a record's relations; otherwise a list
 * of people filterable via `?q=` plus counts.
 */
export const GET: RequestHandler = ({ locals, url }) => {
  requireAdmin(locals);

  const id = url.searchParams.get("id");
  if (id) {
    return json({ relations: getLegacyPersonRelations(id) });
  }

  const q = url.searchParams.get("q") ?? "";
  return json({
    exists: legacyExists(),
    counts: getLegacyCounts(),
    people: getLegacyPeople(q),
  });
};
