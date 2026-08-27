import { json } from '@sveltejs/kit';

/** Liveness probe (utilisee par le healthcheck Docker et la CD). */
export const GET = () => json({ status: 'ok' });
