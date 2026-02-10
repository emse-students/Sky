import type { RequestHandler } from './$types';
import { getPersonById } from '$lib/server/database';
import { getPersonInitials } from '$lib/utils/format';

// Environment variable - loaded by Bun or SvelteKit
const MIGALLERY_API_KEY = process.env.MIGALLERY_API_KEY;
const MIGALLERY_API_URL = process.env.MIGALLERY_API_URL || 'https://gallery.mitv.fr';

console.debug('[Avatar API] MIGALLERY_API_KEY:', MIGALLERY_API_KEY ? '✓ Set' : '✗ Missing');
console.debug('[Avatar API] MIGALLERY_API_URL:', MIGALLERY_API_URL);

if (!MIGALLERY_API_KEY) {
	console.error('[Avatar API] MIGALLERY_API_KEY is not set in environment variables');
}

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	console.debug(`[Avatar API] Fetching avatar for: ${id}`);

	if (!MIGALLERY_API_KEY) {
		console.error('[Avatar API] API key not configured');
		return new Response(null, { status: 500 });
	}

	try {
		// 1. Check if user has a custom image in database
		const person = getPersonById(id);
		if (person && person.image) {
			console.debug(`[Avatar API] Found custom image in DB for ${id}`);
			// If it's a full URL, redirect or fetch it? Redirect is faster/easier for external URLs
			// but if we want to hide origin or handle CORS, we might proxy.
			// For simplicity and speed, let's redirect if it looks like a URL.
			if (person.image.startsWith('http')) {
				return new Response(null, {
					status: 302,
					headers: { Location: person.image }
				});
			}
		}

		// 2. Try MiGallery
		const apiUrl = `${MIGALLERY_API_URL}/api/users/${id}/avatar`;
		console.debug(`[Avatar API] Calling: ${apiUrl}`);

		const response = await fetch(apiUrl, {
			headers: {
				'x-api-key': MIGALLERY_API_KEY
			}
		});

		console.debug(`[Avatar API] Response status: ${response.status}`);

		if (!response.ok) {
			console.debug(
				`[Avatar API] API returned error: ${response.status} ${response.statusText}`
			);
			// Get person from database for proper initials
			let initials = '?';
			try {
				const person = getPersonById(id);
				if (person) {
					initials = getPersonInitials(person);
				} else {
					// Fallback: extract from ID format (prenom.nom)
					initials = id
						.split('.')
						.slice(0, 2)
						.map((part: string) => part.charAt(0).toUpperCase())
						.join('');
				}
			} catch {
				// Double fallback
				initials = id
					.split('.')
					.slice(0, 2)
					.map((part: string) => part.charAt(0).toUpperCase())
					.join('');
			}
			// Return a placeholder SVG avatar
			const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
				<defs>
					<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
						<stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
						<stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
					</linearGradient>
				</defs>
				<rect width="200" height="200" fill="url(#grad)"/>
				<text x="100" y="120" font-family="Arial, sans-serif" font-size="80" fill="white" text-anchor="middle" font-weight="bold">${initials}</text>
			</svg>`;
			return new Response(svg, {
				headers: {
					'Content-Type': 'image/svg+xml',
					'Cache-Control': 'public, max-age=3600'
				}
			});
		}

		// Forward the image with appropriate headers
		const imageBuffer = await response.arrayBuffer();
		const contentType = response.headers.get('content-type') || 'image/jpeg';

		console.debug(
			`[Avatar API] Success! Content-Type: ${contentType}, Size: ${imageBuffer.byteLength}`
		);

		return new Response(imageBuffer, {
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=86400' // Cache for 24 hours
			}
		});
	} catch (error) {
		console.error(`[Avatar API] Error fetching avatar for ${id}:`, error);
		return new Response(null, { status: 500 });
	}
};
