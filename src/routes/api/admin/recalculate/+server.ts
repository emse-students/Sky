import type { RequestHandler } from './$types';
import { recalculatePositions } from '$lib/server/database';

export const POST: RequestHandler = ({ locals }) => {
	// Check admin authorization
	if (locals.user?.profile_id !== 'jolan.boudin') {
		return new Response('Unauthorized', { status: 403 });
	}

	try {
		// Launch in background
		recalculatePositions().catch((error) => {
			console.error('Position recalculation failed:', error);
		});

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Recalculation error:', error);
		return new Response('Recalculation failed', { status: 500 });
	}
};
