import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const positionsPath = path.resolve('database/positions.json');

    if (!existsSync(positionsPath)) {
      // Initial stub if file doesn't exist yet
      return Response.json({});
    }

    const data = await fs.readFile(positionsPath, 'utf-8');
    const positions = JSON.parse(data) as Record<string, unknown>;

    return Response.json(positions);
  } catch (error) {
    console.error('Error serving positions:', error);
    return Response.json({ error: 'Failed to load positions' }, { status: 500 });
  }
};
