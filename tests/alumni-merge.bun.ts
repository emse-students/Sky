/**
 * Canari's Alumni merge, Sky's half (`src/lib/server/alumni-merge/`), on a REAL database in a
 * throwaway folder (the `merge-log.bun.ts` pattern: `bun:sqlite` exists only under Bun), driven by
 * tokens signed here as Canari's site-jobs worker signs them (ES256, `typ: canari-merge+jwt`,
 * audience `sky`, claims `mode`, `dup`, `target`, `jti`), verified by the vendored
 * `src/lib/server/handoff/alumni-merge-verify.ts`.
 *
 * Pinned: the three outcomes and the `erase` mode (its token carries no `target`); a replay answers `absent` and changes nothing;
 * `mergePeople` keeps the clubs and drops a link between the two fiches; the role is never carried;
 * every table of the schema is classified (a new one fails here); the token refused when absent,
 * expired, of another audience, of another `typ`, or when the trust is unset; no subject is logged
 * whole.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';

type Db = typeof import('#lib/server/database.js');
type Handle = typeof import('../src/lib/server/alumni-merge/handle');

const realRoot = process.cwd();
let root: string;
let database: Db;
let handle: Handle;

const ISSUER = 'https://canari.example';
const DUP = 'd0d0d0d0-1111-4000-8000-000000000001';
const TARGET = 'aaaaaaaa-2222-4000-8000-000000000002';
const NOW = new Date(1_800_000_000_000);
const NOW_S = Math.floor(NOW.getTime() / 1000);

const { privateKey, publicKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256', use: 'sig' };
const trust: { issuer: string; keys: JWTVerifyGetKey } = {
  issuer: ISSUER,
  keys: createLocalJWKSet({ keys: [jwk] }),
};

/** A call token as Canari's worker signs it; `overrides` breaks one thing at a time. */
async function mint(
  overrides: {
    aud?: string;
    typ?: string;
    iat?: number;
    exp?: number;
    mode?: string;
    dup?: string;
    /** `null` leaves the claim out; the default is the target for a transfer, none for an erase. */
    target?: string | null;
  } = {}
): Promise<string> {
  const iat = overrides.iat ?? NOW_S - 1;
  const claims: Record<string, unknown> = {
    iss: ISSUER,
    aud: overrides.aud ?? 'sky',
    dup: overrides.dup ?? DUP,
    jti: 'job-0001',
    iat,
    exp: overrides.exp ?? iat + 60,
  };
  if (overrides.mode !== undefined) claims.mode = overrides.mode;
  // As Canari signs it: a transfer names its target, an erase never does.
  const target =
    overrides.target === undefined
      ? overrides.mode === 'erase'
        ? null
        : TARGET
      : overrides.target;
  if (target !== null) claims.target = target;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', typ: overrides.typ ?? 'canari-merge+jwt', kid: 'test' })
    .sign(privateKey);
}

async function call(token: string | null, t: typeof trust | null = trust) {
  return handle.handleAlumniMerge({
    authorization: token === null ? null : `Bearer ${token}`,
    trust: t,
    now: NOW,
  });
}

const logged: string[] = [];

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-alumni-merge-'));
  fs.mkdirSync(path.join(root, 'database'));
  fs.copyFileSync(
    path.join(realRoot, 'database', 'schema.sql'),
    path.join(root, 'database', 'schema.sql')
  );
  process.chdir(root);
  database = await import('#lib/server/database.js');
  expect(database.DB_PATH.startsWith(root)).toBe(true);
  handle = await import('../src/lib/server/alumni-merge/handle');
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
    console.warn('[alumni-merge test] temporary folder not removed:', (e as Error).message);
  }
});

const db = () => database.getDatabase();

function addPerson(id: string, sub: string | null, role = 'user'): void {
  db()
    .prepare(
      `INSERT INTO people (id, first_name, last_name, level, auth_sub, formation, role, last_login)
       VALUES (?, 'Bea', 'Martin', 2020, ?, 'ICM', ?, 1)`
    )
    .run(id, sub, role);
}

function link(source: string, target: string, type = 'parrainage'): void {
  db()
    .prepare('INSERT INTO relationships (source_id, target_id, type) VALUES (?, ?, ?)')
    .run(source, target, type);
}

function rows<T>(sql: string, ...params: string[]): T[] {
  return db()
    .prepare(sql)
    .all(...params) as T[];
}

/** The duplicate's account with a session, a pending link choice and a handoff redemption. */
function seedDuplicateAccount(id = DUP): void {
  addPerson(id, DUP, 'admin');
  db()
    .prepare(
      "INSERT INTO sessions (token, person_id, expires_at) VALUES ('tok-dup', ?, 9999999999)"
    )
    .run(id);
  db()
    .prepare(
      "INSERT INTO pending_links (token, sub, expires_at) VALUES ('pend-dup', ?, 9999999999)"
    )
    .run(DUP);
  db()
    .prepare(
      "INSERT INTO handoff_redemptions (jti, sub, exp, redeemed_at) VALUES ('h-dup', ?, 1, 1)"
    )
    .run(DUP);
  db().prepare("INSERT INTO associations (person_id, name) VALUES (?, 'BDE')").run(id);
}

function traceOfDuplicateSubject(): number {
  return (
    rows<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM people WHERE auth_sub = ?1)
            + (SELECT COUNT(*) FROM pending_links WHERE sub = ?1)
            + (SELECT COUNT(*) FROM handoff_redemptions WHERE sub = ?1) AS n`,
      DUP
    )[0]?.n ?? -1
  );
}

beforeEach(() => {
  logged.length = 0;
  db().exec(`DELETE FROM sessions; DELETE FROM pending_links; DELETE FROM handoff_redemptions;
             DELETE FROM associations; DELETE FROM relationships; DELETE FROM merge_log;
             DELETE FROM ignored_merge_pairs; DELETE FROM people;`);
  addPerson('godparent', null);
  addPerson('godchild', null);
});

describe('the transfer', () => {
  it('moves the account onto the target when the target has no record: transferred', async () => {
    seedDuplicateAccount();
    link('godparent', DUP);

    const answer = await call(await mint());

    expect(answer).toEqual({ status: 200, body: { outcome: 'transferred' } });
    const [record] = rows<{ id: string; auth_sub: string; role: string }>(
      'SELECT id, auth_sub, role FROM people WHERE id = ?',
      DUP
    );
    // The record IS the person: its graph and role stay, its subject is the target's.
    expect(record).toEqual({ id: DUP, auth_sub: TARGET, role: 'admin' });
    expect(rows('SELECT 1 FROM relationships WHERE target_id = ?', DUP)).toHaveLength(1);
    expect(rows('SELECT 1 FROM sessions')).toHaveLength(0);
    expect(traceOfDuplicateSubject()).toBe(0);
  });

  it('merges into the target record when it exists: merged, links and clubs moved, role dropped', async () => {
    seedDuplicateAccount();
    addPerson('kept', TARGET);
    link('godparent', DUP);
    link(DUP, 'godchild', 'adoption');
    link(DUP, 'kept', 'adoption');
    db().prepare('INSERT INTO ignored_merge_pairs (a_id, b_id) VALUES (?, ?)').run(DUP, 'godchild');

    const answer = await call(await mint());

    expect(answer).toEqual({ status: 200, body: { outcome: 'merged' } });
    expect(rows('SELECT 1 FROM people WHERE id = ?', DUP)).toHaveLength(0);
    expect(rows('SELECT role FROM people WHERE id = ?', 'kept')).toEqual([{ role: 'user' }]);
    expect(rows('SELECT source_id, target_id, type FROM relationships ORDER BY source_id')).toEqual(
      [
        { source_id: 'godparent', target_id: 'kept', type: 'parrainage' },
        { source_id: 'kept', target_id: 'godchild', type: 'adoption' },
      ]
    );
    expect(rows('SELECT person_id, name FROM associations')).toEqual([
      { person_id: 'kept', name: 'BDE' },
    ]);
    expect(rows('SELECT merged_by, removed_id, kept_id FROM merge_log')).toEqual([
      { merged_by: 'alumni-merge', removed_id: DUP, kept_id: 'kept' },
    ]);
    expect(rows('SELECT 1 FROM ignored_merge_pairs')).toHaveLength(0);
    expect(traceOfDuplicateSubject()).toBe(0);
    expect(logged.some((l) => l.includes('dropped role=admin'))).toBe(true);
  });

  it('answers absent when the duplicate never signed in to Sky, and writes nothing', async () => {
    addPerson('kept', TARGET);

    const answer = await call(await mint());

    expect(answer).toEqual({ status: 200, body: { outcome: 'absent' } });
    expect(rows('SELECT 1 FROM merge_log')).toHaveLength(0);
    expect(rows('SELECT auth_sub FROM people WHERE id = ?', 'kept')).toEqual([
      { auth_sub: TARGET },
    ]);
  });

  it.each(['transferred', 'merged'])(
    'a retry after %s answers absent and changes nothing',
    async (first) => {
      seedDuplicateAccount();
      if (first === 'merged') addPerson('kept', TARGET);
      link('godparent', DUP);
      expect((await call(await mint())).body).toEqual({ outcome: first });
      const before = rows('SELECT * FROM people ORDER BY id');
      const relationsBefore = rows('SELECT * FROM relationships ORDER BY id');
      const logBefore = rows('SELECT * FROM merge_log');

      // Canari did not record the first answer, so it calls again with the same job id.
      const again = await call(await mint());

      expect(again).toEqual({ status: 200, body: { outcome: 'absent' } });
      expect(rows('SELECT * FROM people ORDER BY id')).toEqual(before);
      expect(rows('SELECT * FROM relationships ORDER BY id')).toEqual(relationsBefore);
      expect(rows('SELECT * FROM merge_log')).toEqual(logBefore);
    }
  );

  it('leaves everything as it was when the transaction fails', async () => {
    seedDuplicateAccount();
    addPerson('kept', TARGET);
    db().exec(
      "CREATE TRIGGER refuse_merge_log BEFORE INSERT ON merge_log BEGIN SELECT RAISE(ABORT, 'refused'); END"
    );
    try {
      await expect(call(await mint())).rejects.toThrow();
    } finally {
      db().exec('DROP TRIGGER refuse_merge_log');
    }
    expect(rows('SELECT auth_sub FROM people WHERE id = ?', DUP)).toEqual([{ auth_sub: DUP }]);
    expect(rows('SELECT 1 FROM sessions')).toHaveLength(1);
    expect(rows('SELECT 1 FROM pending_links')).toHaveLength(1);
  });
});

describe('the erase-only mode (the target was erased in the meantime)', () => {
  it('turns a record in the graph back into a placeholder: erased', async () => {
    seedDuplicateAccount();
    link('godparent', DUP);

    const answer = await call(await mint({ mode: 'erase' }));

    expect(answer).toEqual({ status: 200, body: { outcome: 'erased' } });
    expect(
      rows('SELECT auth_sub, role, formation, last_login FROM people WHERE id = ?', DUP)
    ).toEqual([{ auth_sub: null, role: 'user', formation: null, last_login: null }]);
    expect(rows('SELECT 1 FROM relationships WHERE target_id = ?', DUP)).toHaveLength(1);
    expect(rows('SELECT 1 FROM people WHERE auth_sub = ?', TARGET)).toHaveLength(0);
    expect(traceOfDuplicateSubject()).toBe(0);
    expect(rows('SELECT 1 FROM sessions')).toHaveLength(0);
  });

  it("deletes a record that is in nobody else's graph", async () => {
    addPerson(DUP, DUP);

    expect((await call(await mint({ mode: 'erase' }))).body).toEqual({ outcome: 'erased' });
    expect(rows('SELECT 1 FROM people WHERE id = ?', DUP)).toHaveLength(0);
    expect((await call(await mint({ mode: 'erase' }))).body).toEqual({ outcome: 'absent' });
  });

  it('refuses an erase token that names a target, and a transfer token that names none', async () => {
    seedDuplicateAccount();
    expect((await call(await mint({ mode: 'erase', target: TARGET }))).status).toBe(401);
    expect((await call(await mint({ mode: 'transfer', target: null }))).status).toBe(401);
    expect(traceOfDuplicateSubject()).toBe(3);
  });

  it('refuses an unknown mode', async () => {
    seedDuplicateAccount();
    expect((await call(await mint({ mode: 'steal' }))).status).toBe(401);
    expect(traceOfDuplicateSubject()).toBeGreaterThan(0);
  });
});

describe('the authentication', () => {
  it.each([
    ['no token', null, 'invalid'],
    ['another audience', { aud: 'migallery' }, 'wrong_audience'],
    ['another typ (a sign-in handoff token)', { typ: 'canari-handoff+jwt' }, 'invalid'],
    ['an expired token', { iat: NOW_S - 600, exp: NOW_S - 540 }, 'expired'],
    ['a lifetime above 60 s', { iat: NOW_S - 1, exp: NOW_S + 3600 }, 'too_long'],
  ] as const)('refuses %s with 401 and changes nothing', async (_what, overrides, outcome) => {
    seedDuplicateAccount();
    const answer = await call(overrides === null ? null : await mint(overrides));
    expect(answer).toEqual({ status: 401, body: { outcome } });
    expect(traceOfDuplicateSubject()).toBe(3);
  });

  it('refuses a token signed by another key', async () => {
    seedDuplicateAccount();
    const other = await generateKeyPair('ES256');
    const forged = await new SignJWT({
      iss: ISSUER,
      aud: 'sky',
      dup: DUP,
      target: TARGET,
      jti: 'x',
      iat: NOW_S,
      exp: NOW_S + 60,
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'canari-merge+jwt', kid: 'test' })
      .sign(other.privateKey);
    expect((await call(forged)).status).toBe(401);
    expect(traceOfDuplicateSubject()).toBe(3);
  });

  it('refuses every call with 503 when the trust is not configured', async () => {
    seedDuplicateAccount();
    expect(await call(await mint(), null)).toEqual({
      status: 503,
      body: { outcome: 'not_configured' },
    });
    expect(traceOfDuplicateSubject()).toBe(3);
  });

  it('blocks a call whose duplicate is its target (409, typed)', async () => {
    seedDuplicateAccount();
    const token = await new SignJWT({
      iss: ISSUER,
      aud: 'sky',
      dup: DUP,
      target: DUP,
      jti: 'x',
      iat: NOW_S,
      exp: NOW_S + 60,
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'canari-merge+jwt', kid: 'test' })
      .sign(privateKey);
    expect(await call(token)).toEqual({
      status: 409,
      body: { code: 'ALUMNI_MERGE_SAME_SUBJECT' },
    });
  });
});

describe('what the merge touches', () => {
  it('classifies every table of the schema (a new table must be placed in a list)', () => {
    const tables = rows<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).map((t) => t.name);
    const classified: readonly string[] = Object.values(database.ALUMNI_MERGE_TABLES).flat();
    expect(tables.filter((t) => !classified.includes(t))).toEqual([]);
  });

  it('logs no subject whole', async () => {
    seedDuplicateAccount();
    await call(await mint());
    expect(logged.length).toBeGreaterThan(0);
    expect(logged.some((l) => l.includes(DUP) || l.includes(TARGET))).toBe(false);
  });
});
