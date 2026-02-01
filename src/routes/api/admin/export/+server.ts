import type { RequestHandler } from './$types';
import { readFileSync } from 'fs';
import { DB_PATH } from '$lib/server/database';

export const GET: RequestHandler = ({ locals }) => {
	// Check admin authorization
	if (locals.user?.profile_id !== 'jolan.boudin') {
		return new Response('Unauthorized', { status: 403 });
	}

	try {
		const dbBuffer = readFileSync(DB_PATH);

		return new Response(dbBuffer, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': `attachment; filename="sky-backup-${new Date().toISOString().split('T')[0]}.db"`
			}
		});
	} catch (error) {
		console.error('Export error:', error);
		return new Response('Export failed', { status: 500 });
	}
};
