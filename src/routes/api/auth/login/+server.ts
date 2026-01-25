import { json } from '@sveltejs/kit';
import { auth } from '$server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { email, name } = await request.json();
	const { token, user } = auth.createSession(email, name);

	cookies.set('sky_session', token, {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 60 * 24 * 7,
		sameSite: 'strict'
	});

	return json({ user });
};
