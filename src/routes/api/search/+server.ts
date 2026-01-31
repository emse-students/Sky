import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchPeople } from '$lib/server/database';

export const GET: RequestHandler = ({ url }) => {
	const query = url.searchParams.get('q');

	if (!query || query.trim().length < 2) {
		return json({ results: [] });
	}

	try {
		const results = searchPeople(query);
		return json({ results });
	} catch (error) {
		console.error('Search error:', error);
		return json({ results: [] });
	}
};
