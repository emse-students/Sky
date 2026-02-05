import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user || user.profile_id !== 'jolan.boudin') {
		throw redirect(302, '/');
	}
	return {};
};
