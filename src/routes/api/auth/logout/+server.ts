import { json } from '@sveltejs/kit';
import { auth } from '$server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const token = cookies.get('sky_session');
	if (token) {
		auth.deleteSession(token);
	}

	cookies.delete('sky_session', { path: '/' });

	return json({ success: true });
};
