import { json } from '@sveltejs/kit';
import { getGraphData, saveGraphData } from '$lib/server/data';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	// TODO: Check admin auth

	const { id } = params;
	const data = await getGraphData();

	if (!data) {
		return json({ error: 'Failed to load data' }, { status: 500 });
	}

	if (!data.people[id]) {
		return json({ error: 'Person not found' }, { status: 404 });
	}

	delete data.people[id];

	// Also remove relations involving this person
	data.relationships = data.relationships.filter((r) =>
		r.source !== id && r.target !== id
	);

	const saved = await saveGraphData(data);
	if (!saved) {
		return json({ error: 'Failed to save data' }, { status: 500 });
	}

	return json({ success: true });
};
