import { json, type RequestHandler } from '@sveltejs/kit';
import { handleAlumniMerge } from '#lib/server/alumni-merge/handle.js';

/**
 * POST /api/internal/alumni-merge - Canari's Alumni merge, Sky's half
 * (`#lib/server/alumni-merge/handle.js`). Server to server: authenticated by the ES256 token in
 * `Authorization`, never by a session (exempt from the gate in `hooks.server.ts`). The body is not
 * read: everything the call needs is in the signed claims.
 */
export const POST: RequestHandler = async ({ request }) => {
  const answer = await handleAlumniMerge({ authorization: request.headers.get('authorization') });
  return json(answer.body, { status: answer.status, headers: { 'cache-control': 'no-store' } });
};
