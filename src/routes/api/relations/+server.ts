import { json } from '@sveltejs/kit';
import { createRelationship, deleteRelationship } from '$lib/server/database';
import type { RequestHandler } from './$types';
import type { JsonRelation } from '$types/graph';

export const POST: RequestHandler = async ({ request }) => {
	// TODO: Check admin auth

	const relation = (await request.json()) as JsonRelation;
	
    try {
        const success = createRelationship(relation);
        return json({ success, relation });
    } catch (error) {
        console.error('Failed to create relation:', error);
        return json({ error: 'Failed to create relation' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ url }) => {
	// TODO: Check admin auth

	const source = url.searchParams.get('source');
	const target = url.searchParams.get('target');
	const type = url.searchParams.get('type') || undefined;

	if (!source || !target) {
		return json({ error: 'Missing source or target' }, { status: 400 });
	}

    try {
        const success = deleteRelationship(source, target, type);
        if (!success) {
            return json({ error: 'Relation not found' }, { status: 404 });
        }
        return json({ success: true });
    } catch (error) {
         console.error('Failed to delete relation:', error);
        return json({ error: 'Failed to delete relation' }, { status: 500 });
    }
};
