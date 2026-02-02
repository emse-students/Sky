import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDatabase, recalculatePositions } from '$lib/server/database';

export const GET: RequestHandler = () => {
	try {
		const db = getDatabase();
		const relationships = db.prepare('SELECT * FROM relationships').all();
		return json(relationships);
	} catch (error) {
		console.error('Error fetching relationships:', error);
		return json({ error: 'Failed to fetch relationships' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user || !user.profile_id) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	try {
		const db = getDatabase();
		const body = (await request.json()) as {
			targetId?: string;
			type?: string;
			role?: 'parrain' | 'fillot';
		};
		const { targetId, type, role = 'fillot' } = body;

		// Validate inputs
		if (!targetId || !type) {
			return json({ error: 'Missing targetId or type' }, { status: 400 });
		}

		// Validate type
		if (!['parrainage', 'adoption'].includes(type)) {
			return json({ error: 'Invalid relationship type' }, { status: 400 });
		}

		// Determine who is source and who is target
		// parrain = source, fillot = target
		let sourceId: string;
		let targetUser: string;

		if (role === 'parrain') {
			sourceId = targetId; // The person I selected is the Parrain (Source)
			targetUser = user.profile_id; // I am the Fillot (Target)
		} else {
			sourceId = user.profile_id; // I am the Parrain (Source)
			targetUser = targetId; // The person I selected is the Fillot (Target)
		}

		// Check if relationship already exists
		const existing = db
			.prepare(
				`
			SELECT id FROM relationships 
			WHERE source_id = ? AND target_id = ?
		`
			)
			.get(sourceId, targetUser);

		if (existing) {
			return json({ error: 'Relationship already exists' }, { status: 400 });
		}

		// Check total fillots limit for the SOURCE (Parrain)
		// Max 3 fillots (official + adoption included)
		const totalFillotsQuery = `
			SELECT COUNT(*) as count FROM relationships 
			WHERE source_id = ?
              AND type IN ('parrainage', 'adoption')
		`;
		const totalFillots = db.prepare(totalFillotsQuery).get(sourceId) as {
			count: number;
		};

		if (totalFillots.count >= 3) {
			return json(
				{
					error:
						role === 'fillot'
							? 'Vous avez déjà atteint la limite de 3 fillots.'
							: 'Ce parrain a déjà atteint la limite de 3 fillots.'
				},
				{ status: 400 }
			);
		}

		// Check if I (Target) already have a Parrain of this type (if official)
		// Usually you only have 1 official Parrain
		if (type === 'parrainage') {
			const existingParrain = db
				.prepare(
					'SELECT id FROM relationships WHERE target_id = ? AND type = \'parrainage\''
				)
				.get(targetUser);

			if (existingParrain) {
				return json(
					{
						error:
							role === 'parrain'
								? 'Vous avez déjà un parrain officiel.'
								: 'Cette personne a déjà un parrain officiel.'
					},
					{ status: 400 }
				);
			}
		}

		// Create relationship
		db.prepare(
			`
			INSERT INTO relationships (source_id, target_id, type)
			VALUES (?, ?, ?)
		`
		).run(sourceId, targetUser, type);

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
		const db = getDatabase();
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
