import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPerson, updatePerson, getRelationships } from '$lib/server/database';

export const GET: RequestHandler = ({ locals, params }) => {
	const user = locals.user;
	if (!user || !user.profile_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		// Get person data
		const person = getPerson(user.profile_id);
		if (!person) {
			return json({ error: 'Profile not found' }, { status: 404 });
		}

		// Get relationships
		const relationships = getRelationships(user.profile_id);

		return json({
			person,
			relationships
		});
	} catch (error) {
		console.error('Error fetching profile:', error);
		return json({ error: 'Failed to fetch profile' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !user.profile_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const data = await request.json();
		const { bio, links } = data;

		// Update person
		updatePerson(user.profile_id, { bio, links });

		return json({ success: true });
	} catch (error) {
		console.error('Error updating profile:', error);
		return json({ error: 'Failed to update profile' }, { status: 500 });
	}
};
