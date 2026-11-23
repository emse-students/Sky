/**
 * THE SIGN-IN HANDOFF'S REDEMPTION - Canari, signed in, opens Sky with a 60-second token in the
 * fragment of `/auth/handoff`; the landing page posts it here, and this opens Sky's ordinary
 * session, MARKED (docs/wiki/authentication.md, "Signed in from Canari"; the contract is Canari's
 * docs/wiki/backlog.d/sign-in-handoff-to-the-ecosystem-sites-and-migallery-notifications.md,
 * section 8 - the step numbers below are its).
 *
 * Steps 1-3 are the vendored verifier (`handoff-verify.ts`, byte-identical to Canari's source).
 * What is Sky's: the `Origin` check, the admission - the record LINKED to the token's `sub` (F1:
 * nothing written on it) through the SAME ICM gate the MiConnect callback applies
 * (`#lib/server/admission.js`) - the interstitial ALWAYS before anything is written, single use
 * from the `handoff_redemptions` ledger (the INSERT is the decision) and the marked session, opened
 * in the same transaction.
 *
 * Every refusal is logged with its class and the `jti` when known - NEVER the token.
 */
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { getHandoffPerson, redeemHandoffToken } from '#lib/server/database.js';
import { admits, roleAtSignIn } from '#lib/server/admission.js';
import {
  HANDOFF_LEEWAY_SECONDS,
  verifyHandoff,
  type HandoffRefusalClass,
} from '#lib/server/handoff/handoff-verify.js';
import type { SessionUser } from '#lib/types/api.js';

/** Sky's id in Canari's registry: a constant of this site, never a variable. */
export const HANDOFF_AUDIENCE = 'sky';
/** The longest token the body may carry. */
export const HANDOFF_TOKEN_MAX_LENGTH = 4096;
/**
 * How long a fetched JWKS is trusted: within 60-120 s, never jose's 10-minute default, so a key
 * Canari rotated out stops verifying within two minutes. An unknown `kid` refetches at once.
 */
export const HANDOFF_JWKS_CACHE_MS = 60_000;

/** What the redemption answers: the HTTP status and the JSON body the landing page reads. */
export interface Redemption {
  status: number;
  body: Record<string, unknown>;
  /** Set when a session was opened: the cookie to hand the browser. */
  session?: { token: string; expiresAt: number };
}

/** The request, as far as the redemption needs it. */
export interface RedeemInput {
  /** The request's `Origin` header. */
  origin: string | null;
  /** Sky's own origin (`event.url.origin`). */
  ownOrigin: string;
  contentType: string | null;
  /** The parsed JSON body, or `undefined` when it was not JSON. */
  body: unknown;
  /** The live session this browser already holds, if any: its token and its user. */
  current: { token: string; user: SessionUser } | null;
  /** The clock; tests pass the vector's. */
  now?: Date;
  /** The trust; tests pass an issuer and a local key set. Default: the configuration. */
  trust?: { issuer: string; keys: JWTVerifyGetKey };
}

let jwks: { url: string; keys: JWTVerifyGetKey } | null = null;

/**
 * The issuer and keys this deployment trusts (`CANARI_HANDOFF_ISSUER`, `CANARI_HANDOFF_JWKS`), or
 * null when the handoff is not configured - then every redemption answers `not_offered` and the
 * landing page sends the user through MiConnect, which is what an unconfigured site does.
 */
export function handoffTrust(): { issuer: string; keys: JWTVerifyGetKey } | null {
  const issuer = process.env.CANARI_HANDOFF_ISSUER?.trim();
  const url = process.env.CANARI_HANDOFF_JWKS?.trim();
  if (!issuer || !url) {
    return null;
  }
  if (!jwks || jwks.url !== url) {
    jwks = {
      url,
      keys: createRemoteJWKSet(new URL(url), { cacheMaxAge: HANDOFF_JWKS_CACHE_MS }),
    };
  }
  return { issuer, keys: jwks.keys };
}

/**
 * `dest` as Sky's redirect validator sees it: a path on this origin - one leading slash, never two
 * (`//host` is another origin), no backslash (which a browser reads as a slash), no control
 * character. Canari signed it and its registry allows only `/` for Sky; this is the site's own
 * check on top, so a token cannot send the browser off the site whatever Canari signed.
 */
export function handoffDestAllowed(dest: string): boolean {
  return (
    dest.startsWith('/') &&
    !dest.startsWith('//') &&
    !dest.includes('\\') &&
    ![...dest].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  );
}

function refuse(status: number, outcome: string, jti: string | null): Redemption {
  const line = `[HANDOFF] refused class=${outcome} jti=${jti ?? 'none'}`;
  if (outcome === 'keys_unavailable') {
    // Canari's keys could not be fetched: an outage on our side of the contract, not the token's.
    console.error(line);
  } else if (outcome === 'replayed' || outcome === 'bad_origin' || outcome === 'not_admitted') {
    console.warn(line);
  } else {
    console.info(line);
  }
  return { status, body: { outcome } };
}

/** The name the interstitial shows, as Sky writes a name everywhere: "LASTNAME Firstname". */
function displayName(person: { firstName: string; lastName: string }): string {
  return `${person.lastName.toUpperCase()} ${person.firstName}`.trim();
}

/** The redemption, steps 0 to 7. Never throws for a client's input; a database fault does. */
export async function redeemHandoff(input: RedeemInput): Promise<Redemption> {
  // 0. Same origin, JSON, the token in the body.
  if (input.origin !== input.ownOrigin) {
    return refuse(403, 'bad_origin', null);
  }
  if (!(input.contentType ?? '').toLowerCase().startsWith('application/json')) {
    return refuse(415, 'invalid', null);
  }
  const body = (input.body ?? null) as { token?: unknown; confirm?: unknown } | null;
  const token = body?.token;
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > HANDOFF_TOKEN_MAX_LENGTH ||
    (body?.confirm !== undefined && typeof body.confirm !== 'boolean')
  ) {
    return refuse(400, 'invalid', null);
  }
  const confirm = body?.confirm === true;

  const trust = input.trust ?? handoffTrust();
  if (!trust) {
    return refuse(404, 'not_offered', null);
  }

  // 1-3. Signature, header, issuer, audience, time, lifetime, dest.
  const now = input.now ?? new Date();
  const verified = await verifyHandoff(token, {
    keys: trust.keys,
    issuer: trust.issuer,
    audience: HANDOFF_AUDIENCE,
    redirectAllows: handoffDestAllowed,
    currentDate: now,
  });
  if (verified.outcome !== 'ok') {
    const status = verified.outcome === 'keys_unavailable' ? 503 : 400;
    return refuse(status, verified.outcome satisfies HandoffRefusalClass, null);
  }
  const { sub, jti, dest, exp } = verified.claims;

  // 6 (F1), asked first because the interstitial names the person: the record LINKED to this
  // `sub`. None - a first visit, or an account still to be linked (`choice` -> `/auth/link`) - goes
  // through MiConnect, where the linking happens exactly as after any sign-in.
  const person = getHandoffPerson(sub);
  if (!person) {
    console.info(`[HANDOFF] unknown_user jti=${jti}`);
    return { status: 200, body: { outcome: 'unknown_user', dest } };
  }
  // The ICM gate, the one the callback applies, on the record's own formation and role. Refused
  // here, the page sends the user through MiConnect, whose callback refuses them the same way.
  if (!admits(person.formation, roleAtSignIn(sub, person.role))) {
    return refuse(403, 'not_admitted', jti);
  }

  // 4. The interstitial, ALWAYS - unless this browser is already signed in as the same person, when
  // nothing changes hands. Nothing is written: the click redeems the same token.
  const sameUser = input.current?.user.id === person.id;
  if (!confirm && !sameUser) {
    return {
      status: 200,
      body: {
        outcome: 'confirm',
        current: input.current ? input.current.user.name : null,
        // `/api/avatar/` is public: a browser without a session can draw it.
        next: { name: displayName(person), photo: `/api/avatar/${encodeURIComponent(person.id)}` },
      },
    };
  }

  // 5-7 in ONE transaction: the ledger row, the old session's deletion and the marked session.
  const result = redeemHandoffToken({
    jti,
    sub,
    exp,
    nowSeconds: Math.floor(now.getTime() / 1000),
    leewaySeconds: HANDOFF_LEEWAY_SECONDS,
    // The same person's session is kept as it is (a MiConnect one stays unmarked).
    personId: sameUser ? null : person.id,
    replaced: sameUser ? null : (input.current?.token ?? null),
  });
  if (result.replayed) {
    return refuse(409, 'replayed', jti);
  }
  if (!result.session) {
    console.info(`[HANDOFF] redeemed jti=${jti} sub=${sub} session=kept`);
    return { status: 200, body: { outcome: 'ok', dest } };
  }
  console.info(`[HANDOFF] redeemed jti=${jti} sub=${sub}`);
  return { status: 200, body: { outcome: 'ok', dest }, session: result.session };
}
