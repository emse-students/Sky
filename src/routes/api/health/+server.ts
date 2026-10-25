/** Liveness probe (utilisee par le healthcheck Docker et la CD). */
export const GET = () => Response.json({ status: 'ok' });
