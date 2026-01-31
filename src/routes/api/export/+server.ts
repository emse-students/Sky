import { json } from '@sveltejs/kit';
import { exportGraphData } from '$lib/server/database';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const data = exportGraphData();
		
		// Return as downloadable JSON
		return new Response(JSON.stringify(data, null, 2), {
			headers: {
				'Content-Type': 'application/json',
				'Content-Disposition': 'attachment; filename="sky_data.json"'
			}
		});
	} catch (error) {
		console.error('Error exporting graph data:', error);
		return json({ error: 'Failed to export graph data' }, { status: 500 });
	}
};
