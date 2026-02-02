import { json } from '@sveltejs/kit';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const positionsPath = path.resolve('database/positions.json');

		if (!existsSync(positionsPath)) {
			// Initial stub if file doesn't exist yet
			return json({});
		}

		const data = await fs.readFile(positionsPath, 'utf-8');
		const positions = JSON.parse(data) as Record<string, unknown>;

		return json(positions);
	} catch (error) {
		console.error('Error serving positions:', error);
		return json({ error: 'Failed to load positions' }, { status: 500 });
	}
};
