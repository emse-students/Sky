import { json } from '@sveltejs/kit';
import { getGraphData, saveGraphData } from '$lib/server/data';
import type { RequestHandler } from './$types';
import type { JsonRelation } from '$types/graph';

export const POST: RequestHandler = async ({ request }) => {
	// TODO: Check admin auth

	const relation = (await request.json()) as JsonRelation;
	const data = await getGraphData();

	if (!data) {
		return json({ error: 'Failed to load data' }, { status: 500 });
	}

	// Check if exists
	const exists = data.relationships.some((r) =>
		r.source === relation.source &&
        r.target === relation.target &&
        r.type === relation.type
	);

	if (!exists) {
		data.relationships.push(relation);
		const saved = await saveGraphData(data);
		if (!saved) {
			return json({ error: 'Failed to save data' }, { status: 500 });
		}
	}

	return json({ success: true, relation });
};

export const DELETE: RequestHandler = async ({ url }) => {
	// TODO: Check admin auth

	const source = url.searchParams.get('source');
	const target = url.searchParams.get('target');
	const type = url.searchParams.get('type');

	if (!source || !target) {
		return json({ error: 'Missing source or target' }, { status: 400 });
	}

	const data = await getGraphData();
	if (!data) {
		return json({ error: 'Failed to load data' }, { status: 500 });
	}

	const initialLen = data.relationships.length;
	data.relationships = data.relationships.filter((r) =>
		!(r.source === source && r.target === target && (!type || r.type === type))
	);

	if (data.relationships.length === initialLen) {
		return json({ error: 'Relation not found' }, { status: 404 });
	}

	const saved = await saveGraphData(data);
	if (!saved) {
		return json({ error: 'Failed to save data' }, { status: 500 });
	}

	return json({ success: true });
};
