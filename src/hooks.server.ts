import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from '$lib/auth';
import { auth } from '$lib/server/auth';

const protectHandle: Handle = async ({ event, resolve }) => {
	// Check for session token cookie first (dev login)
	const sessionToken = event.cookies.get('session_token');

	if (sessionToken) {
		const user = auth.validateSession(sessionToken);
		if (user) {
			event.locals.user = user;
			return resolve(event);
		}
	} else {
		// console.log('No session token found');
	}

	// Fallback to Auth.js session
	const session = await event.locals.getSession();
	if (session?.user) {
		const casId = session.user.id;
		const email = session.user.email || (casId ? `${casId}@etu.emse.fr` : '');
		const name = session.user.name || casId || 'Unknown';

		if (email && casId) {
			const user = auth.getOrCreateUser(email, name, casId);
			event.locals.user = user;
		} else {
			// Fallback stub if essential info is missing
			event.locals.user = {
				id: 0,
				email,
				name,
				profile_id: casId || null,
				role: 'user',
				first_login: 0,
				avatar: session.user.image || undefined
			};
		}
	} else {
		event.locals.user = null;
	}
	return resolve(event);
};

export const handle = sequence(authHandle, protectHandle);
