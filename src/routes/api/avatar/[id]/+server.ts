import type { RequestHandler } from "./$types";
import { getPersonById, getPersonAuthSub } from "$lib/server/database";
import { getPersonInitials } from "$lib/utils/format";
import { OUTBOUND_BUDGET_MS } from "$lib/server/outbound";

// Environment variable - loaded by Bun or SvelteKit
const MIGALLERY_API_KEY = process.env.MIGALLERY_API_KEY;
const MIGALLERY_API_URL =
  process.env.MIGALLERY_API_URL || "https://gallery.mitv.fr";

console.debug(
  "[Avatar API] MIGALLERY_API_KEY:",
  MIGALLERY_API_KEY ? "✓ Set" : "✗ Missing",
);
console.debug("[Avatar API] MIGALLERY_API_URL:", MIGALLERY_API_URL);

if (!MIGALLERY_API_KEY) {
  console.error(
    "[Avatar API] MIGALLERY_API_KEY is not set in environment variables",
  );
}

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;

  console.debug(`[Avatar API] Fetching avatar for: ${id}`);

  if (!MIGALLERY_API_KEY) {
    console.error("[Avatar API] API key not configured");
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
      if (person.image.startsWith("http")) {
        return new Response(null, {
          status: 302,
          headers: { Location: person.image },
        });
      }
    }

    // 2. Try MiGallery via the Authentik sub (photo key). A placeholder record
    // (no linked account) has no MiGallery photo -> initials directly.
    const sub = getPersonAuthSub(id);

    // An upstream that cannot be reached is NOT an upstream saying "no photo", and the two may not
    // share a log level: one is this person having no picture, the other is MiGallery being down
    // or refusing OUR key. Both degrade to initials - a decoration never costs the caller an error
    // - but only the first is silent. `response` stays null for either, so the branch below reads
    // "we have no image to serve", whatever the reason.
    let response: Response | null = null;
    if (sub) {
      try {
        response = await fetch(`${MIGALLERY_API_URL}/api/users/${sub}/avatar`, {
          headers: { "x-api-key": MIGALLERY_API_KEY },
          signal: AbortSignal.timeout(OUTBOUND_BUDGET_MS),
        });
      } catch (error) {
        console.error(
          `[Avatar API] MiGallery unreachable within ${OUTBOUND_BUDGET_MS}ms (${MIGALLERY_API_URL}):`,
          error instanceof Error ? `${error.name} ${error.message}` : error,
        );
      }
    } else {
      console.debug(`[Avatar API] ${id} has no linked account -> initials`);
    }

    if (response && !response.ok && response.status !== 404) {
      // 401/403 here is OUR key being refused, and it would otherwise be indistinguishable from a
      // faceless account: every avatar in the tree would quietly turn into initials and nothing
      // would say why. Named loudly, with the destination, because the fix is a deployment one.
      console.error(
        `[Avatar API] MiGallery answered ${response.status} for a photo lookup - key refused or upstream broken`,
      );
      response = null;
    }

    if (!response || !response.ok) {
      console.debug(`[Avatar API] No photo for ${id} -> initials`);
      // Get person from database for proper initials (every branch below assigns).
      let initials: string;
      try {
        const person = getPersonById(id);
        if (person) {
          initials = getPersonInitials(person);
        } else {
          // Fallback: extract from ID format (prenom.nom)
          initials = id
            .split(".")
            .slice(0, 2)
            .map((part: string) => part.charAt(0).toUpperCase())
            .join("");
        }
      } catch {
        // Double fallback
        initials = id
          .split(".")
          .slice(0, 2)
          .map((part: string) => part.charAt(0).toUpperCase())
          .join("");
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
          "Content-Type": "image/svg+xml",
          // Placeholder (no photo): do not cache, otherwise the real photo only
          // appears after expiry (a hard refresh would be required).
          "Cache-Control": "no-store",
        },
      });
    }

    // Forward the image with appropriate headers
    const imageBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    console.debug(
      `[Avatar API] Success! Content-Type: ${contentType}, Size: ${imageBuffer.byteLength}`,
    );

    return new Response(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        // Short cache + revalidation: a new photo appears quickly without a hard
        // refresh, while avoiding a re-download on every view.
        "Cache-Control": "public, max-age=600, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error(`[Avatar API] Error fetching avatar for ${id}:`, error);
    return new Response(null, { status: 500 });
  }
};
