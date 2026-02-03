import type { RequestHandler } from './$types';
import { writeFileSync, copyFileSync } from 'fs';
import { DB_PATH } from '$lib/server/database';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

		// Run migrations on imported database
		try {
			console.debug('Running migrations on imported database...');

			// Run integrity check + FTS rebuild
			await execAsync('node scripts/check-db-integrity.js');

			// Run bio migration
			await execAsync('node scripts/migrate-add-bio.js');

			console.debug('Migrations completed successfully');
		} catch (migrationError) {
			console.error('Migration error (non-fatal):', migrationError);
			// Don't fail the import if migrations fail
		}

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		console.error('Import error:', error);
		return new Response('Import failed', { status: 500 });
	}
};
