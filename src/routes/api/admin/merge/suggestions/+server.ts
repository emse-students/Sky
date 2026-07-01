import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMergeSuggestions, ignoreMergePair } from "$lib/server/database";
import { requireAdmin } from "$lib/server/guards";

/** Near-duplicate pairs the admin can review (merge or ignore). */
export const GET: RequestHandler = ({ locals }) => {
  requireAdmin(locals);
  return json({ suggestions: getMergeSuggestions() });
};

/** Ignore a suggested pair so it stops being proposed. */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const { aId, bId } = (await request.json()) as { aId?: string; bId?: string };
  if (!aId || !bId) {
    return json({ error: "aId and bId required" }, { status: 400 });
  }
  ignoreMergePair(aId, bId);
  return json({ success: true });
};
