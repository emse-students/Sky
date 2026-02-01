import { json } from '@sveltejs/kit';
import { auth } from '$server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	const token = cookies.get('session_token');
	if (token) {
		auth.deleteSession(token);
	}

	cookies.delete('session_token', { path: '/' });

	return json({ success: true });
};
