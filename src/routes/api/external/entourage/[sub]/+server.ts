import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { timingSafeEqual } from "crypto";
import { getEntourageBySub } from "$lib/server/database";

// Inbound public API key (Canari -> Sky). Empty = every call is rejected.
const SKY_API_KEY = process.env.SKY_API_KEY;

/** Timing-safe comparison of a provided key against SKY_API_KEY. */
function validKey(provided: string | null): boolean {
  if (!SKY_API_KEY || !provided) {
    return false;
  }
  const expected = Buffer.from(SKY_API_KEY);
  const received = Buffer.from(provided);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

/**
 * Public API protected by x-api-key (SKY_API_KEY): a person's godparent
 * entourage keyed by their Authentik sub. Consumed by Canari to show the close
 * tree on the profile page. Exempt from the session gate (cf. hooks.server.ts)
 * because authentication is the key, not an ICM session.
 */
export const GET: RequestHandler = ({ params, request }) => {
  if (!validKey(request.headers.get("x-api-key"))) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  const { sub } = params;
  return json(getEntourageBySub(sub));
};
