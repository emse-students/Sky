import type { RequestHandler } from './$types';
import { getMergeSuggestions, ignoreMergePair } from '#lib/server/database.js';
import { requireAdmin } from '#lib/server/guards.js';

/** Near-duplicate pairs the admin can review (merge or ignore). */
export const GET: RequestHandler = ({ locals }) => {
  requireAdmin(locals);
  return Response.json({ suggestions: getMergeSuggestions() });
};

/** Ignore a suggested pair so it stops being proposed. */
export const POST: RequestHandler = async ({ request, locals }) => {
  requireAdmin(locals);
  const { aId, bId } = (await request.json()) as { aId?: string; bId?: string };
  if (!aId || !bId) {
    return Response.json({ error: 'aId and bId required' }, { status: 400 });
  }
  ignoreMergePair(aId, bId);
  return Response.json({ success: true });
};
