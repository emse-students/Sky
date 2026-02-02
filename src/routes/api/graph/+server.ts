import { json } from '@sveltejs/kit';
import { exportGraphData } from '$lib/server/database';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	try {
		const data = exportGraphData();
		return json(data);
	} catch (error: any) {
		console.error('Error fetching graph data:', error);
		return json({ error: 'Failed to load graph data', details: error.message }, { status: 500 });
	}
};
