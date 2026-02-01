import type { RequestHandler } from './$types';
import { writeFileSync, copyFileSync } from 'fs';
import { DB_PATH } from '$lib/server/database';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check admin authorization
	if (locals.user?.profile_id !== 'jolan.boudin') {
		return new Response('Unauthorized', { status: 403 });
	}

	try {
		const formData = await request.formData();
		const file = formData.get('database') as File;

		if (!file) {
			return new Response('No file provided', { status: 400 });
		}

		// Create backup of current database
		const backupPath = `${DB_PATH}.backup-${Date.now()}`;
		copyFileSync(DB_PATH, backupPath);

		// Write new database
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		writeFileSync(DB_PATH, buffer);

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Import error:', error);
		return new Response('Import failed', { status: 500 });
	}
};
