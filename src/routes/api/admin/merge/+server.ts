import { json } from '@sveltejs/kit';
import { mergePeople } from '$lib/server/database';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = (await request.json()) as { sourceId: string; targetId: string };
		const { sourceId, targetId } = body;

		if (!sourceId || !targetId) {
			return json({ error: 'Missing sourceId or targetId' }, { status: 400 });
		}

		if (sourceId === targetId) {
			return json({ error: 'Cannot merge person into themselves' }, { status: 400 });
		}

		mergePeople(sourceId, targetId);

		return json({ success: true });
	} catch (error) {
		console.error('Merge failed:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Merge failed', details: message }, { status: 500 });
	}
};
