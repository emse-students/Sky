import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import { handle as authHandle } from '$lib/auth';
import type { User } from '$lib/types/api';

const protectHandle: Handle = async ({ event, resolve }) => {
	const session = await event.locals.getSession();
	if (session?.user) {
		// Adapting session user to application User type
		// TODO: Implement actual database lookup/creation
		event.locals.user = {
			id: 0,
			email: session.user.email || '',
			name: session.user.name || '',
			profile_id: null,
			role: 'user',
			first_login: 0,
			avatar: session.user.image || undefined
		};
	} else {
		event.locals.user = null;
	}
	return resolve(event);
};

export const handle = sequence(authHandle, protectHandle);
