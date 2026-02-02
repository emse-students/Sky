import { json } from '@sveltejs/kit';
import { exportGraphData } from '$lib/server/database';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	try {
		const data = exportGraphData();
		return json(data);
	} catch (error) {
		console.error('Error fetching graph data:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: 'Failed to load graph data', details: message }, { status: 500 });
	}
};
