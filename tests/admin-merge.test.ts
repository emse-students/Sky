import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { POST as mergePost } from '../src/routes/api/admin/merge/+server';
import { mergePeople } from '#lib/server/database.js';

vi.mock('#lib/server/database.js', () => ({
  mergePeople: vi.fn(),
  recalculatePositions: vi.fn(() => Promise.resolve()),
  getPersonAuthSub: vi.fn(() => null),
  MergePersonNotFoundError: class extends Error {},
}));

type MergeEvent = RequestEvent<Record<string, never>, '/api/admin/merge'>;

/** A merge request as the route receives it, from a session with the given role (or none). */
function mergeEvent(role: 'admin' | 'user' | null): MergeEvent {
  return {
    request: new Request('http://sky.test/api/admin/merge', {
      method: 'POST',
      body: JSON.stringify({ sourceId: 'a', targetId: 'b' }),
    }),
    locals: { user: role ? { id: 'someone', role } : null },
  } as unknown as MergeEvent;
}

describe('POST /api/admin/merge', () => {
  beforeEach(() => {
    (mergePeople as Mock).mockClear();
  });

  it('merges for an admin, and hands the merge the id of the admin who made it', async () => {
    const response = await mergePost(mergeEvent('admin'));

    expect(response.status).toBe(200);
    expect(mergePeople).toHaveBeenCalledWith('a', 'b', undefined, 'someone');
  });

  it.each(['user', null] as const)('answers 403 and merges nothing for role %s', async (role) => {
    await expect(mergePost(mergeEvent(role))).rejects.toMatchObject({ status: 403 });
    expect(mergePeople).not.toHaveBeenCalled();
  });
});
