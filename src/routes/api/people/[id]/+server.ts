import { json } from '@sveltejs/kit';
import { deletePerson } from '$lib/server/database';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params }) => {
	// TODO: Check admin auth

	const { id } = params;
	
	try {
        const success = deletePerson(id);
        if (!success) {
            return json({ error: 'Person not found' }, { status: 404 });
        }
        return json({ success: true });
    } catch (error) {
        console.error('Failed to delete person:', error);
        return json({ error: 'Failed to delete person' }, { status: 500 });
    }
};
