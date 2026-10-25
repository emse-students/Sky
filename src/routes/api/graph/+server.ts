import { exportGraphData } from '#lib/server/database.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  try {
    const data = exportGraphData();
    return Response.json(data);
  } catch (error) {
    console.error('Error fetching graph data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: 'Failed to load graph data', details: message }, { status: 500 });
  }
};
