import { json } from '@sveltejs/kit';
import { createPerson } from '$lib/server/database';
import type { RequestHandler } from './$types';
import type { Person } from '$types/graph';

export const POST: RequestHandler = async ({ request }) => {
	// TODO: Check admin auth

	const person = (await request.json()) as Person;

	try {
		const newId = createPerson({
			id: person.id,
			prenom: person.prenom,
			nom: person.nom,
			surnom: person.surnom,
			bio: person.bio,
			image: person.image,
			level: person.level,
			links: person.links,
			associations: person.associations
		});

		return json({ id: newId });
	} catch (error) {
		console.error('Failed to create person:', error);
		return json({ error: 'Failed to create person' }, { status: 500 });
	}
};
