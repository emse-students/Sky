import { json } from '@sveltejs/kit';
import { recalculatePositions } from '$lib/server/database';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await recalculatePositions();
		return json({ success: true });
	} catch (error) {
		console.error('Recalculation failed:', error);
		return json({ error: 'Failed to recalculate positions' }, { status: 500 });
	}
};
