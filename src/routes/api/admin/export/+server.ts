import type { RequestHandler } from './$types';
import { exportDatabaseWithoutSessions } from '#lib/server/database.js';

export const GET: RequestHandler = ({ locals }) => {
  // Check admin authorization
  if (locals.user?.role !== 'admin') {
    return new Response('Unauthorized', { status: 403 });
  }

  try {
    // A copy without live sessions: the download must not be a way to sign in as anyone.
    const dbBuffer = exportDatabaseWithoutSessions();

    return new Response(new Uint8Array(dbBuffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="sky-backup-${new Date().toISOString().split('T')[0]}.db"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new Response('Export failed', { status: 500 });
  }
};
