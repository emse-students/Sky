/**
 * THE ALUMNI MERGE CALL TOKEN'S VERIFIER - the server-to-server call Canari makes when an Alumni
 * merge completes (Canari's docs/wiki/profiles-and-access.md, D54): a compact JWS, ES256, signed by
 * Canari's HANDOFF key, `typ: canari-merge+jwt`, audience `sky`, claims `dup`, `target`, `jti` (the
 * job's id), `iat`, `exp`, and optionally `mode`.
 *
 * The same key and JWKS as the sign-in handoff (`handoffTrust()`), its OWN type, so neither token is
 * ever taken for the other (RFC 8725): the vendored handoff verifier refuses this `typ`, and this one
 * refuses `canari-handoff+jwt`. Not vendored: Canari ships no verifier for this token in
 * `libs/handoff/` yet; when it does, this file is replaced by the byte-identical copy.
 *
 * Classified by the error's CLASS, never its message. A failure to OBTAIN the keys is
 * `keys_unavailable`, decided inside the key resolver, so nothing a token carries can pass for an
 * outage. It never logs and never returns the token.
 */
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  HANDOFF_LEEWAY_SECONDS,
  HANDOFF_MAX_LIFETIME_SECONDS,
} from '#lib/server/handoff/handoff-verify.js';
import type { AlumniMergeMode } from '#lib/server/database.js';

/** The token's `typ` header, Canari's `ALUMNI_MERGE_TOKEN_TYPE`. */
export const ALUMNI_MERGE_TOKEN_TYPE = 'canari-merge+jwt';

/** Why a token was refused. */
export type AlumniMergeRefusalClass =
  | 'keys_unavailable'
  | 'invalid'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'expired'
  | 'not_yet_valid'
  | 'too_long';

/** The claims a verified call carries. */
export interface AlumniMergeClaims {
  /** The duplicate's MiConnect subject. */
  dup: string;
  /** The target's MiConnect subject. */
  target: string;
  /** Canari's job id. */
  jti: string;
  /** `transfer` when the claim is absent (what Canari sends today). */
  mode: AlumniMergeMode;
}

export type AlumniMergeVerification =
  | { outcome: 'ok'; claims: AlumniMergeClaims }
  | { outcome: AlumniMergeRefusalClass };

/** A subject as MiConnect writes it (`hashed_user_id`: 64 hex) or any opaque id: bounded, printable. */
const SUBJECT = /^[A-Za-z0-9._-]{1,128}$/;

/** Verifies an Alumni merge call token for `audience`. */
export async function verifyAlumniMergeCall(
  token: string,
  options: { keys: JWTVerifyGetKey; issuer: string; audience: string; currentDate?: Date }
): Promise<AlumniMergeVerification> {
  const currentDate = options.currentDate ?? new Date();
  const keys: JWTVerifyGetKey = async (header, token) => {
    try {
      return await options.keys(header, token);
    } catch (e) {
      if (e instanceof errors.JWKSNoMatchingKey || e instanceof errors.JWKSMultipleMatchingKeys) {
        throw e;
      }
      throw new KeysUnavailable(e);
    }
  };
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ['ES256'],
      typ: ALUMNI_MERGE_TOKEN_TYPE,
      issuer: options.issuer,
      audience: options.audience,
      clockTolerance: HANDOFF_LEEWAY_SECONDS,
      requiredClaims: ['dup', 'target', 'jti', 'iat', 'exp'],
      currentDate,
    }));
  } catch (e) {
    return { outcome: classify(e) };
  }
  const { dup, target, jti, iat, exp, mode } = payload;
  if (
    typeof dup !== 'string' ||
    typeof target !== 'string' ||
    typeof jti !== 'string' ||
    typeof iat !== 'number' ||
    typeof exp !== 'number' ||
    !SUBJECT.test(dup) ||
    !SUBJECT.test(target) ||
    jti.length === 0 ||
    jti.length > 128 ||
    (mode !== undefined && mode !== 'transfer' && mode !== 'erase')
  ) {
    return { outcome: 'invalid' };
  }
  const now = Math.floor(currentDate.getTime() / 1000);
  if (iat > now + HANDOFF_LEEWAY_SECONDS) return { outcome: 'not_yet_valid' };
  if (exp - iat > HANDOFF_MAX_LIFETIME_SECONDS) return { outcome: 'too_long' };
  return { outcome: 'ok', claims: { dup, target, jti, mode: mode ?? 'transfer' } };
}

/** The key resolver could not obtain Canari's keys; `cause` is what it threw. */
class KeysUnavailable extends Error {
  constructor(readonly cause: unknown) {
    super('alumni merge keys unavailable');
  }
}

/** A jose failure, as a refusal class. Anything unrecognised is `invalid`. */
function classify(e: unknown): AlumniMergeRefusalClass {
  if (e instanceof KeysUnavailable) return 'keys_unavailable';
  if (e instanceof errors.JWTExpired) return 'expired';
  if (e instanceof errors.JWTClaimValidationFailed) {
    if (e.claim === 'iss') return 'wrong_issuer';
    if (e.claim === 'aud') return 'wrong_audience';
    if (e.claim === 'iat' || e.claim === 'nbf') return 'not_yet_valid';
  }
  return 'invalid';
}
