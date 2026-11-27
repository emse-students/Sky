/**
 * `POST /api/internal/alumni-merge` - Sky's half of Canari's Alumni merge (Canari's
 * docs/wiki/profiles-and-access.md, D52-D54; Sky's docs/wiki/identity-model.md, "The Alumni merge").
 *
 * Canari's site-jobs worker calls it once per completed merge, with `Authorization: Bearer <token>`
 * (`./verify.ts`) and an empty JSON body: everything is in the signed claims. The answers:
 *
 * - `200 { outcome }` - `absent` | `transferred` | `merged` | `erased` (`applyAlumniMerge`);
 * - `401 { outcome: <class> }` - no token, or a token refused (signature, type, issuer, audience,
 *   time, claims): retried by Canari, and fixed by a deployment, never by a retry alone;
 * - `409 { code: 'ALUMNI_MERGE_SAME_SUBJECT' }` - the duplicate IS the target: a state no retry
 *   changes, so Canari blocks the job;
 * - `503 { outcome: 'keys_unavailable' | 'not_configured' }` - Canari's JWKS unreachable, or the
 *   trust (`CANARI_HANDOFF_ISSUER`, `CANARI_HANDOFF_JWKS`) unset: refused, logged at error, retried.
 *
 * No 5xx answers a state. Every line names the job by its `jti` and each subject by its first 8
 * characters - never a name, never the token.
 */
import type { JWTVerifyGetKey } from 'jose';
import { applyAlumniMerge } from '#lib/server/database.js';
import { handoffTrust, HANDOFF_AUDIENCE, HANDOFF_TOKEN_MAX_LENGTH } from '../handoff/redeem.js';
import { verifyAlumniMergeCall } from './verify.js';

/** What the endpoint answers. */
export interface AlumniMergeAnswer {
  status: number;
  body: Record<string, unknown>;
}

/** A subject as a log line may show it. */
function prefix(subject: string): string {
  return subject.slice(0, 8);
}

/**
 * The call, from its `Authorization` header to its answer. Never throws for a caller's input; a
 * database fault does (a 500, retried by Canari, and the transaction left nothing behind).
 */
export async function handleAlumniMerge(input: {
  authorization: string | null;
  /** The trust; tests pass an issuer and a local key set. Default: the configuration. */
  trust?: { issuer: string; keys: JWTVerifyGetKey } | null;
  now?: Date;
}): Promise<AlumniMergeAnswer> {
  console.debug('[ALUMNI_MERGE] call received');
  const trust = input.trust === undefined ? handoffTrust() : input.trust;
  if (!trust) {
    // No issuer or JWKS: this estate cannot tell Canari from anyone. Refused, never accepted.
    console.error(
      '[ALUMNI_MERGE] refused class=not_configured - CANARI_HANDOFF_ISSUER / CANARI_HANDOFF_JWKS unset'
    );
    return { status: 503, body: { outcome: 'not_configured' } };
  }

  const header = input.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (token.length === 0 || token.length > HANDOFF_TOKEN_MAX_LENGTH) {
    console.warn('[ALUMNI_MERGE] refused class=no_token');
    return { status: 401, body: { outcome: 'invalid' } };
  }

  const verified = await verifyAlumniMergeCall(token, {
    keys: trust.keys,
    issuer: trust.issuer,
    audience: HANDOFF_AUDIENCE,
    currentDate: input.now,
  });
  if (verified.outcome !== 'ok') {
    if (verified.outcome === 'keys_unavailable') {
      console.error('[ALUMNI_MERGE] refused class=keys_unavailable - Canari JWKS unreachable');
      return { status: 503, body: { outcome: verified.outcome } };
    }
    console.warn(`[ALUMNI_MERGE] refused class=${verified.outcome}`);
    return { status: 401, body: { outcome: verified.outcome } };
  }

  const { dup, target, jti, mode } = verified.claims;
  const tag = `jti=${jti} dup=${prefix(dup)} target=${prefix(target)} mode=${mode}`;
  if (dup === target) {
    console.error(`[ALUMNI_MERGE] refused ${tag} - the duplicate is the target`);
    return { status: 409, body: { code: 'ALUMNI_MERGE_SAME_SUBJECT' } };
  }

  let result;
  try {
    result = applyAlumniMerge({ dup, target, mode });
  } catch (e) {
    console.error(`[ALUMNI_MERGE] failed ${tag} - rolled back:`, (e as Error).name);
    throw e;
  }
  if (result.droppedRole) {
    // A privilege belongs to the account it was granted to (D52): said, never carried.
    console.warn(`[ALUMNI_MERGE] ${tag} dropped role=${result.droppedRole}`);
  }
  console.info(`[ALUMNI_MERGE] done ${tag} outcome=${result.outcome}`);
  return { status: 200, body: { outcome: result.outcome } };
}
