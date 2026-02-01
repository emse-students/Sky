import { json } from '@sveltejs/kit';
import { createPerson, getAllPeople } from '$lib/server/database';
import type { RequestHandler } from './$types';
import type { Person } from '$types/graph';

export const GET: RequestHandler = async () => {
	try {
		const people = getAllPeople();
		return json(people);
	} catch (error) {
		console.error('Failed to fetch people:', error);
		return json({ error: 'Failed to fetch people' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	// TODO: Check admin auth

	const person = (await request.json()) as Person;

	try {
		const newId = createPerson({
			id: person.id,
			prenom: person.prenom,
			nom: person.nom,
			image: person.image,
			level: person.level,
			links: person.links
		});

		return json({ id: newId });
	} catch (error) {
		console.error('Failed to create person:', error);
		return json({ error: 'Failed to create person' }, { status: 500 });
	}
};
