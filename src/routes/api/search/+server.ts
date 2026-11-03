import type { RequestHandler } from './$types';
import { searchPeople } from '#lib/server/database.js';

export const GET: RequestHandler = ({ url }) => {
  const query = url.searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return Response.json({ results: [] });
  }

  try {
    const results = searchPeople(query);
    return Response.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    return Response.json({ results: [] });
  }
};
