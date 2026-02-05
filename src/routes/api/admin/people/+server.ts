import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase, recalculatePositions } from '$lib/server/database';

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || user.profile_id !== 'jolan.boudin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const data = await request.json() as {
		id: string;
		prenom: string;
		nom: string;
		level: number | null;
		bio?: string;
		image_url?: string;
	};

	try {
		const db = getDatabase();

		// Check if ID already exists
		const existing = db.prepare('SELECT id FROM people WHERE id = ?').get(data.id);
		if (existing) {
			return json({ error: 'ID already exists' }, { status: 400 });
		}

		// Insert person
		const insertStmt = db.prepare(`
			INSERT INTO people (id, first_name, last_name, level, bio, image_url)
			VALUES (?, ?, ?, ?, ?, ?)
		`);

		insertStmt.run(
			data.id,
			data.prenom,
			data.nom,
			data.level,
			data.bio || null,
			data.image_url || null
		);

		recalculatePositions().catch(console.error);

		return json({ success: true, id: data.id });
	} catch (error) {
		console.error('Create person error:', error);
		return json({ error: 'Failed to create person' }, { status: 500 });
	}
};
