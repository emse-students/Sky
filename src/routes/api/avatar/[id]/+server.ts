import type { RequestHandler } from './$types';

const MIGALLERY_API_KEY = 'pArlmji6ankvno-zAPwD96jA-EOn8Xb2egd6APlT3Ac';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	console.debug(`[Avatar API] Fetching avatar for: ${id}`);

	try {
		const apiUrl = `https://gallery.mitv.fr/api/users/${id}/avatar`;
		console.debug(`[Avatar API] Calling: ${apiUrl}`);

		const response = await fetch(apiUrl, {
			headers: {
				'x-api-key': MIGALLERY_API_KEY
			}
		});

		console.debug(`[Avatar API] Response status: ${response.status}`);

		if (!response.ok) {
			console.debug(`[Avatar API] API returned error: ${response.status} ${response.statusText}`);
			// Return a placeholder SVG avatar
			const initials = id.split('.').map(part => part.charAt(0).toUpperCase()).join('');
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

		console.debug(`[Avatar API] Success! Content-Type: ${contentType}, Size: ${imageBuffer.byteLength}`);

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
