import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Database from 'better-sqlite3';
import { recalculatePositions } from '$lib/server/database';

const db = new Database('database/sky.db');

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !user.profile_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const body = (await request.json()) as { targetId?: string; type?: string };
		const { targetId, type } = body;

		// Validate inputs
		if (!targetId || !type) {
			return json({ error: 'Missing targetId or type' }, { status: 400 });
		}

		// Validate type
		if (!['parrainage', 'adoption'].includes(type)) {
			return json({ error: 'Invalid relationship type' }, { status: 400 });
		}

		// Check if relationship already exists
		const existing = db
			.prepare(
				`
			SELECT id FROM relationships 
			WHERE (source_id = ? AND target_id = ?) 
			   OR (source_id = ? AND target_id = ?)
		`
			)
			.get(user.profile_id, targetId, targetId, user.profile_id);

		if (existing) {
			return json({ error: 'Relationship already exists' }, { status: 400 });
		}

		// Check total fillots limit (max 3 across both types)
		// I am the SOURCE of the relationship (I am the Parrain)
		const totalFillotsQuery = `
			SELECT COUNT(*) as count FROM relationships 
			WHERE source_id = ?
              AND type IN ('parrainage', 'adoption')
		`;
		const totalFillots = db.prepare(totalFillotsQuery).get(user.profile_id) as {
      count: number;
    };

		if (totalFillots.count >= 3) {
			return json(
				{
					error:
            'Vous avez déjà atteint la limite de 3 fillots (total officiel + adoption)'
				},
				{ status: 400 }
			);
		}

		// Create relationship (Me = Source/Parrain, Target = Fillot)
		db.prepare(
			`
			INSERT INTO relationships (source_id, target_id, type)
			VALUES (?, ?, ?)
		`
		).run(user.profile_id, targetId, type);

		// Recalculate positions in background
		recalculatePositions().catch((err) =>
			console.error('Failed to recalculate positions:', err)
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error creating relationship:', error);
		return json({ error: 'Failed to create relationship' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !user.profile_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const body = (await request.json()) as { relationshipId?: number };
		const { relationshipId } = body;

		if (!relationshipId) {
			return json({ error: 'Missing relationshipId' }, { status: 400 });
		}

		// Verify ownership
		const relationship = db
			.prepare(
				`
			SELECT * FROM relationships 
			WHERE id = ? AND (source_id = ? OR target_id = ?)
		`
			)
			.get(relationshipId, user.profile_id, user.profile_id);

		if (!relationship) {
			return json(
				{ error: 'Relationship not found or unauthorized' },
				{ status: 404 }
			);
		}

		// Delete relationship
		db.prepare('DELETE FROM relationships WHERE id = ?').run(relationshipId);

		// Recalculate positions in background
		recalculatePositions().catch((err) =>
			console.error('Failed to recalculate positions:', err)
		);

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting relationship:', error);
		return json({ error: 'Failed to delete relationship' }, { status: 500 });
	}
};
