/**
 * The Canari sign-in handoff's redemption (`src/lib/server/handoff/redeem.ts`), on a REAL database
 * in a throwaway folder (the `merge-log.bun.ts` pattern: `bun:sqlite` exists only under Bun), and
 * Canari's vectors (`tests/fixtures/handoff-token.cases.json`, COPIED from Canari's
 * `libs/contracts/` and regenerated only there). Pinned: every vector answers what Canari says
 * through the vendored verifier, the audience is Sky's own constant, the ICM gate is the callback's,
 * the interstitial comes before anything is written - with no session and with another user's - a
 * token is redeemed once, a wrong Origin is refused, an unlinked `sub` goes through MiConnect, the
 * session opened is MARKED and a MiConnect sign-in replaces it with an unmarked one, and the token
 * is in no log line.
 *
 * The vectors name the audience `migallery`, so the redemption itself is driven by tokens this file
 * signs for `sky` with a throwaway key of the same shape.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JSONWebKeySet,
  type JWTVerifyGetKey,
} from 'jose';

type Db = typeof import('#lib/server/database.js');
type Redeem = typeof import('../src/lib/server/handoff/redeem');
type Verify = typeof import('../src/lib/server/handoff/handoff-verify');
type Session = typeof import('#lib/server/session.js');

const vectors = JSON.parse(
  fs.readFileSync(path.join(import.meta.dir, 'fixtures', 'handoff-token.cases.json'), 'utf8')
) as {
  issuer: string;
  audience: string;
  jwks: JSONWebKeySet;
  cases: Array<{ name: string; token: string; now: number; expect: string }>;
};

const realRoot = process.cwd();
let root: string;
let database: Db;
let redeem: Redeem;
let verify: Verify;
let session: Session;

const ORIGIN = 'https://sky.example';
const ISSUER = 'https://canari.example';
const SUB = '6f1c2a4e-0b7d-4c1e-9a55-3f0e8b2d7c10';
const OTHER_SUB = '0f7d1a3c-0000-4000-8000-0000000000aa';
const NOW = 1_800_000_005;

const { privateKey, publicKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256', use: 'sig' };
const trust: { issuer: string; keys: JWTVerifyGetKey } = {
  issuer: ISSUER,
  keys: createLocalJWKSet({ keys: [jwk] }),
};
let jtiCounter = 0;

/** A token as Canari's mint signs it, for Sky. */
async function mint(
  overrides: { sub?: string; aud?: string; iat?: number; exp?: number } = {}
): Promise<string> {
  const iat = overrides.iat ?? NOW - 5;
  return new SignJWT({
    iss: ISSUER,
    aud: overrides.aud ?? 'sky',
    sub: overrides.sub ?? SUB,
    jti: `jti-${++jtiCounter}`,
    iat,
    exp: overrides.exp ?? iat + 60,
    dest: '/',
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'canari-handoff+jwt', kid: 'test' })
    .sign(privateKey);
}

const logged: string[] = [];

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-handoff-'));
  fs.mkdirSync(path.join(root, 'database'));
  fs.copyFileSync(
    path.join(realRoot, 'database', 'schema.sql'),
    path.join(root, 'database', 'schema.sql')
  );
  // The database path is read from the working directory when the module loads.
  process.chdir(root);
  database = await import('#lib/server/database.js');
  expect(database.DB_PATH.startsWith(root)).toBe(true);
  redeem = await import('../src/lib/server/handoff/redeem');
  verify = await import('../src/lib/server/handoff/handoff-verify');
  session = await import('#lib/server/session.js');
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    });
  }
});

afterAll(() => {
  database.closeDatabase();
  process.chdir(realRoot);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (e) {
    // Windows keeps the database file locked for a moment after close; harmless in the OS tmpdir.
    console.warn('[handoff test] temporary folder not removed:', (e as Error).message);
  }
});

function addPerson(id: string, sub: string, formation: string, role = 'user'): void {
  database
    .getDatabase()
    .prepare(
      `INSERT INTO people (id, first_name, last_name, level, auth_sub, formation, role)
       VALUES (?, 'Bea', 'Martin', 2024, ?, ?, ?)`
    )
    .run(id, sub, formation, role);
}

function sessionsOf(personId: string): Array<{ token: string; via_handoff: number }> {
  return database
    .getDatabase()
    .prepare('SELECT token, via_handoff FROM sessions WHERE person_id = ?')
    .all(personId) as Array<{ token: string; via_handoff: number }>;
}

function redemptionRows(): number {
  return (
    database.getDatabase().prepare('SELECT COUNT(*) AS n FROM handoff_redemptions').get() as {
      n: number;
    }
  ).n;
}

/** A Sky user as the session handler builds it. */
function userOf(id: string, name: string) {
  return {
    id,
    auth_sub: null,
    name,
    role: 'user' as const,
    formation: 'ICM',
    promo: 2024,
    viaHandoff: false,
  };
}

async function call(
  token: string,
  extra: {
    confirm?: boolean;
    origin?: string | null;
    contentType?: string;
    current?: { token: string; user: ReturnType<typeof userOf> };
    now?: number;
    body?: unknown;
  } = {}
) {
  return redeem.redeemHandoff({
    origin: extra.origin === undefined ? ORIGIN : extra.origin,
    ownOrigin: ORIGIN,
    contentType: extra.contentType ?? 'application/json',
    body: 'body' in extra ? extra.body : extra.confirm ? { token, confirm: true } : { token },
    current: extra.current ?? null,
    now: new Date((extra.now ?? NOW) * 1000),
    trust,
  });
}

beforeEach(() => {
  const db = database.getDatabase();
  db.exec('DELETE FROM handoff_redemptions; DELETE FROM sessions; DELETE FROM people;');
  addPerson('bea', SUB, 'ICM');
  logged.length = 0;
  delete process.env.SKY_ADMIN_SUBS;
});

describe("the vectors, through the vendored verifier with Sky's redirect validator", () => {
  for (const c of vectors.cases) {
    it(`${c.name} -> ${c.expect}`, async () => {
      const result = await verify.verifyHandoff(c.token, {
        keys: createLocalJWKSet(vectors.jwks),
        issuer: vectors.issuer,
        audience: vectors.audience,
        redirectAllows: redeem.handoffDestAllowed,
        currentDate: new Date(c.now * 1000),
      });
      expect(result.outcome).toBe(c.expect as never);
    });
  }

  it("the audience is Sky's own constant: a token for another site is wrong_audience", async () => {
    expect(redeem.HANDOFF_AUDIENCE).toBe('sky');
    const valid = vectors.cases.find((c) => c.name === 'valid')!;
    const result = await verify.verifyHandoff(valid.token, {
      keys: createLocalJWKSet(vectors.jwks),
      issuer: vectors.issuer,
      audience: redeem.HANDOFF_AUDIENCE,
      redirectAllows: redeem.handoffDestAllowed,
      currentDate: new Date(valid.now * 1000),
    });
    expect(result.outcome).toBe('wrong_audience');
  });

  it('the redirect validator keeps the browser on this origin', () => {
    for (const ok of ['/', '/tree', '/account']) expect(redeem.handoffDestAllowed(ok)).toBe(true);
    for (const bad of ['//evil.example/x', 'https://evil.example', '/\\evil', '/a\nb', 'x']) {
      expect(redeem.handoffDestAllowed(bad)).toBe(false);
    }
  });
});

describe('the redemption', () => {
  it('shows the interstitial with no session, writing nothing; the click redeems and MARKS the session', async () => {
    const token = await mint();
    const first = await call(token);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      outcome: 'confirm',
      current: null,
      next: { name: 'MARTIN Bea', photo: '/api/avatar/bea' },
    });
    expect(redemptionRows()).toBe(0);
    expect(sessionsOf('bea')).toEqual([]);

    const second = await call(token, { confirm: true });
    expect(second.body).toEqual({ outcome: 'ok', dest: '/' });
    expect(second.session).toBeDefined();
    expect(sessionsOf('bea')).toEqual([{ token: second.session!.token, via_handoff: 1 }]);
    expect(database.getSessionPerson(second.session!.token)?.viaHandoff).toBe(true);
  });

  it('is redeemed once: the same token answers ok, then replayed', async () => {
    const token = await mint();
    expect((await call(token, { confirm: true })).body.outcome).toBe('ok');
    expect(await call(token, { confirm: true })).toEqual({
      status: 409,
      body: { outcome: 'replayed' },
    });
    expect(sessionsOf('bea')).toHaveLength(1);
  });

  it('refuses a wrong Origin, and no Origin, before reading the token', async () => {
    const token = await mint();
    for (const origin of ['https://evil.example', null]) {
      expect(await call(token, { confirm: true, origin })).toEqual({
        status: 403,
        body: { outcome: 'bad_origin' },
      });
    }
    expect(redemptionRows()).toBe(0);
  });

  it('refuses a body that is not JSON or carries no usable token', async () => {
    const token = await mint();
    expect((await call(token, { contentType: 'text/plain' })).status).toBe(415);
    for (const body of [undefined, {}, { token: 3 }, { token: '' }, { token, confirm: 'yes' }]) {
      expect(await call(token, { body })).toEqual({ status: 400, body: { outcome: 'invalid' } });
    }
    expect((await call('x', { body: { token: 'a'.repeat(4097) } })).body.outcome).toBe('invalid');
  });

  it('refuses a token for another site, past its lifetime, or declaring a longer one', async () => {
    expect((await call(await mint({ aud: 'migallery' }), { confirm: true })).body.outcome).toBe(
      'wrong_audience'
    );
    expect((await call(await mint(), { confirm: true, now: NOW + 120 })).body.outcome).toBe(
      'expired'
    );
    expect(
      (await call(await mint({ iat: NOW - 5, exp: NOW + 600 }), { confirm: true })).body.outcome
    ).toBe('too_long');
    expect(redemptionRows()).toBe(0);
  });

  it('applies the ICM gate of the callback: a non-ICM user is refused, an admin passes', async () => {
    addPerson('ines', OTHER_SUB, 'ISMIN');
    expect(await call(await mint({ sub: OTHER_SUB }), { confirm: true })).toEqual({
      status: 403,
      body: { outcome: 'not_admitted' },
    });
    expect(sessionsOf('ines')).toEqual([]);

    process.env.SKY_ADMIN_SUBS = OTHER_SUB;
    expect((await call(await mint({ sub: OTHER_SUB }), { confirm: true })).body.outcome).toBe('ok');
  });

  it('sends a sub linked to no record through MiConnect, where linking happens', async () => {
    expect(await call(await mint({ sub: OTHER_SUB }), { confirm: true })).toEqual({
      status: 200,
      body: { outcome: 'unknown_user', dest: '/' },
    });
    expect(redemptionRows()).toBe(0);
  });

  it('names the live session of another user, and replaces it on the click', async () => {
    addPerson('alex', OTHER_SUB, 'ICM');
    const theirs = database.createSession('alex');
    const current = { token: theirs.token, user: userOf('alex', 'DURAND Alex') };
    const token = await mint();
    const first = await call(token, { current });
    expect(first.body.outcome).toBe('confirm');
    expect(first.body.current).toBe('DURAND Alex');
    expect(sessionsOf('alex')).toHaveLength(1);

    const second = await call(token, { confirm: true, current });
    expect(second.body.outcome).toBe('ok');
    expect(sessionsOf('alex')).toEqual([]);
    expect(sessionsOf('bea')[0].via_handoff).toBe(1);
  });

  it('skips the interstitial for the user already signed in here, and keeps their session unmarked', async () => {
    const mine = database.createSession('bea');
    const result = await call(await mint(), {
      current: { token: mine.token, user: userOf('bea', 'MARTIN Bea') },
    });
    expect(result).toEqual({ status: 200, body: { outcome: 'ok', dest: '/' } });
    expect(sessionsOf('bea')).toEqual([{ token: mine.token, via_handoff: 0 }]);
    expect(redemptionRows()).toBe(1);
  });

  it('purges, by proof, the ledger rows whose token can no longer verify', async () => {
    await call(await mint({ iat: NOW - 1000, exp: NOW - 940 }), { confirm: true, now: NOW - 950 });
    expect(redemptionRows()).toBe(1);
    await call(await mint(), { confirm: true });
    expect(redemptionRows()).toBe(1);
  });

  it('never writes the token into a log line', async () => {
    const token = await mint();
    await call(token);
    await call(token, { confirm: true });
    await call(token, { confirm: true });
    await call(token, { origin: 'https://evil.example' });
    const [, , signature] = token.split('.');
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line.includes(signature)).toBe(false);
  });
});

describe('the MiConnect sign-in is the step-up', () => {
  it('opens an unmarked session and deletes the marked one this browser presented', () => {
    const marked = database.createSession('bea', { viaHandoff: true });
    const jar = new Map<string, string>([['sky_session', marked.token]]);
    const cookies = {
      get: (n: string) => jar.get(n),
      set: (n: string, v: string) => void jar.set(n, v),
      delete: (n: string) => void jar.delete(n),
    } as unknown as Cookies;

    session.openSignedInSession(cookies, 'bea');

    const rows = sessionsOf('bea');
    expect(rows).toHaveLength(1);
    expect(rows[0].via_handoff).toBe(0);
    expect(rows[0].token).toBe(jar.get('sky_session')!);
    expect(database.getSessionPerson(marked.token)).toBeNull();
  });
});
