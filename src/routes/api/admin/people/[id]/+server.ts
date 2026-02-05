import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase } from '$lib/server/database';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = locals.user;
	if (!user || user.profile_id !== 'jolan.boudin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const { id } = params;
	const data = await request.json() as {
		prenom: string;
		nom: string;
		level: number | null;
		bio?: string;
		image_url?: string;
	};

	try {
		const db = getDatabase();

		// Update person
		const updateStmt = db.prepare(`
			UPDATE people 
			SET first_name = ?, last_name = ?, level = ?, bio = ?, image_url = ?
			WHERE id = ?
		`);

		updateStmt.run(
			data.prenom,
			data.nom,
			data.level,
			data.bio || null,
			data.image_url || null,
			id
		);

		return json({ success: true });
	} catch (error) {
		console.error('Update person error:', error);
		return json({ error: 'Failed to update person' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = ({ params, locals }) => {
	const user = locals.user;
	if (!user || user.profile_id !== 'jolan.boudin') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const { id } = params;

	try {
		const db = getDatabase();

		// Delete relationships first (foreign key constraint)
		db.prepare('DELETE FROM relationships WHERE source_id = ? OR target_id = ?').run(id, id);

		// Delete external links
		db.prepare('DELETE FROM external_links WHERE person_id = ?').run(id);

		// Delete person
		db.prepare('DELETE FROM people WHERE id = ?').run(id);

		return json({ success: true });
	} catch (error) {
		console.error('Delete person error:', error);
		return json({ error: 'Failed to delete person' }, { status: 500 });
	}
};
