import { json } from '@sveltejs/kit';
import { getGraphData, saveGraphData } from '$lib/server/data';
import type { RequestHandler } from './$types';
import type { Person } from '$types/graph';

export const POST: RequestHandler = async ({ request }) => {
	// TODO: Check admin auth

	const person = (await request.json()) as Person;
	const data = await getGraphData();

	if (!data) {
		return json({ error: 'Failed to load data' }, { status: 500 });
	}

	// Check if ID exists
	if (!person.id) {
		person.id = crypto.randomUUID();
	}

	const id = person.id!;

	// Since data.people is an object keyed by ID
	data.people[id] = { ...data.people[id], ...person };

	const saved = await saveGraphData(data);
	if (!saved) {
		return json({ error: 'Failed to save data' }, { status: 500 });
	}

	return json({ success: true, person: data.people[id] });
};
