import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/server/auth';
import { getPersonById } from '$lib/server/database';

export const GET: RequestHandler = ({ url, cookies }) => {
	const username = url.searchParams.get('u');

	if (!username) {
		return new Response('Missing username parameter', { status: 400 });
	}

	// Database now uses prenom.nom format
	const profileId = username; // Username IS the profile ID (prenom.nom)
	const email = `${username}@emse.fr`; // Generate email
	let name = username; // Fallback

	// Get real name from database
	try {
		const person = getPersonById(username);
		if (person?.prenom && person?.nom) {
			name = `${person.nom.toUpperCase()} ${person.prenom}`;
		}
	} catch {
		// If not found, generate from ID
		if (username.includes('.')) {
			const [prenom, nom] = username.split('.');
			name = `${nom.toUpperCase()} ${prenom.charAt(0).toUpperCase() + prenom.slice(1)}`;
		}
	}

	// Create dev session
	const { token, user } = auth.createSession(email, name);

	// Link profile
	try {
		auth.linkProfile(user.id, profileId);
	} catch (error) {
		console.error('Failed to link profile:', error);
	}

	// Définir le cookie de session
	cookies.set('session_token', token, {
		path: '/',
		httpOnly: true,
		secure: false, // Dev mode
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 7 // 7 jours
	});

	// Rediriger vers la page principale
	throw redirect(302, '/');
};
