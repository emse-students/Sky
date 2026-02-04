import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = ({ locals }) => {
	// Check if user is admin
	if (locals.user?.profile_id !== 'jolan.boudin') {
		throw redirect(303, '/');
	}

	return {
		user: locals.user
	};
};
