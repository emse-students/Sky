/**
 * The godparent link rules on a REAL database in a throwaway folder (the `merge-log.bun.ts`
 * pattern), and the `POST /api/relationships` contract. Owner decision 2026-11-27: the same
 * promotion is valid; the promo ORDER and GAP are WARNINGS the caller acknowledges with
 * `confirm: [code]`; caps, cycles, self-links, duplicates and an unknown promo stay refusals.
 *
 * Run by `bun test` (`bun run test:db`): the database module opens `bun:sqlite`.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type Db = typeof import('#lib/server/database.js');
type PostEvent = RequestEvent<Record<string, never>, '/api/relationships'>;

const realRoot = process.cwd();
let root: string;
let database: Db;
let post: (event: PostEvent) => Promise<Response> | Response;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-relationships-'));
  fs.mkdirSync(path.join(root, 'database'));
  fs.copyFileSync(
    path.join(realRoot, 'database', 'schema.sql'),
    path.join(root, 'database', 'schema.sql')
  );
  process.chdir(root);
  database = await import('#lib/server/database.js');
  expect(database.DB_PATH.startsWith(root)).toBe(true);
  post = (await import('../src/routes/api/relationships/+server')).POST as typeof post;
});

afterAll(() => {
  database.closeDatabase();
  process.chdir(realRoot);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (e) {
    console.warn('[relationships test] temporary folder not removed:', (e as Error).message);
  }
});

beforeEach(() => {
  database.getDatabase().prepare('DELETE FROM relationships').run();
  database.getDatabase().prepare('DELETE FROM people').run();
});

function addPerson(id: string, level: number | null): void {
  database
    .getDatabase()
    .prepare("INSERT INTO people (id, first_name, last_name, level) VALUES (?, 'A', ?, ?)")
    .run(id, id.toUpperCase(), level);
}

function linkCount(): number {
  return (
    database.getDatabase().prepare('SELECT COUNT(*) AS n FROM relationships').get() as { n: number }
  ).n;
}

function peopleCount(): number {
  return (database.getDatabase().prepare('SELECT COUNT(*) AS n FROM people').get() as { n: number })
    .n;
}

/** The error a call throws, or null. */
function thrown(fn: () => void): { code?: string } | null {
  try {
    fn();
  } catch (e) {
    return e as { code?: string };
  }
  return null;
}

describe('addParrainage promo rules', () => {
  it('links the same promotion with no warning', () => {
    addPerson('p', 2025);
    addPerson('f', 2025);
    database.addParrainage('p', 'f', 'parrainage');
    expect(linkCount()).toBe(1);
  });

  it('links 2023 -> 2026 (3 years) with no warning', () => {
    addPerson('p', 2023);
    addPerson('f', 2026);
    database.addParrainage('p', 'f', 'parrainage');
    expect(linkCount()).toBe(1);
  });

  it('warns on a gap, writes nothing, and links once the code is acknowledged', () => {
    addPerson('p', 2022);
    addPerson('f', 2026);
    const err = thrown(() => database.addParrainage('p', 'f', 'parrainage'));
    expect(err).toBeInstanceOf(database.RelationWarning);
    expect(err?.code).toBe('PROMO_GAP');
    expect(linkCount()).toBe(0);
    database.addParrainage('p', 'f', 'parrainage', ['PROMO_GAP']);
    expect(linkCount()).toBe(1);
  });

  it('warns on a godchild older than the godparent', () => {
    addPerson('p', 2026);
    addPerson('f', 2025);
    const err = thrown(() => database.addParrainage('p', 'f', 'parrainage'));
    expect(err).toBeInstanceOf(database.RelationWarning);
    expect(err?.code).toBe('PROMO_ORDER');
    expect(linkCount()).toBe(0);
  });

  it('does not accept the wrong acknowledgement', () => {
    addPerson('p', 2026);
    addPerson('f', 2025);
    const err = thrown(() => database.addParrainage('p', 'f', 'parrainage', ['PROMO_GAP']));
    expect(err).toBeInstanceOf(database.RelationWarning);
    expect(linkCount()).toBe(0);
  });

  it('keeps an unknown promo a refusal, whatever is acknowledged', () => {
    addPerson('p', null);
    addPerson('f', 2025);
    const err = thrown(() =>
      database.addParrainage('p', 'f', 'parrainage', ['PROMO_GAP', 'PROMO_ORDER'])
    );
    expect(err).toBeInstanceOf(database.RelationError);
    expect(err).not.toBeInstanceOf(database.RelationWarning);
    expect(err?.code).toBe('PROMO_UNKNOWN');
  });

  it('keeps self-link, duplicate, caps and cycles hard even when acknowledged', () => {
    const ack = ['PROMO_GAP', 'PROMO_ORDER'];
    addPerson('a', 2024);
    addPerson('b', 2025);
    addPerson('c', 2025);
    expect(thrown(() => database.addParrainage('a', 'a', 'parrainage', ack))?.code).toBe('SELF');
    database.addParrainage('a', 'b', 'parrainage');
    expect(thrown(() => database.addParrainage('a', 'b', 'parrainage', ack))?.code).toBe(
      'DUPLICATE'
    );
    // b already has an official godparent.
    expect(thrown(() => database.addParrainage('c', 'b', 'parrainage', ack))?.code).toBe(
      'MAX_PARRAIN'
    );
    // b -> a would close a cycle.
    expect(thrown(() => database.addParrainage('b', 'a', 'adoption', ack))?.code).toBe('CYCLE');
  });

  it('rolls a new star back when the link only warns', () => {
    addPerson('p', 2020);
    const err = thrown(() =>
      database.createPlaceholderAndLink('New', 'Star', 2026, 'p', 'p', 'fillot', 'parrainage')
    );
    expect(err).toBeInstanceOf(database.RelationWarning);
    expect(peopleCount()).toBe(1);
    database.createPlaceholderAndLink('New', 'Star', 2026, 'p', 'p', 'fillot', 'parrainage', [
      'PROMO_GAP',
    ]);
    expect(peopleCount()).toBe(2);
    expect(linkCount()).toBe(1);
  });
});

describe('POST /api/relationships contract', () => {
  function request(body: unknown): PostEvent {
    return {
      request: new Request('http://sky.test/api/relationships', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
      locals: { user: { id: 'me', role: 'user' } },
    } as unknown as PostEvent;
  }

  it('answers a typed warning, then creates the link on the acknowledgement', async () => {
    addPerson('me', 2022);
    addPerson('f', 2026);
    const first = await post(request({ type: 'parrainage', role: 'fillot', targetId: 'f' }));
    expect(first.status).toBe(409);
    const body = (await first.json()) as { warning: boolean; code: string; error: string };
    expect(body.warning).toBe(true);
    expect(body.code).toBe('PROMO_GAP');
    expect(typeof body.error).toBe('string');
    expect(linkCount()).toBe(0);

    const second = await post(
      request({ type: 'parrainage', role: 'fillot', targetId: 'f', confirm: [body.code] })
    );
    expect(second.status).toBe(200);
    expect(linkCount()).toBe(1);
  });

  it('ignores an unknown acknowledgement value', async () => {
    addPerson('me', 2022);
    addPerson('f', 2026);
    const res = await post(
      request({ type: 'parrainage', role: 'fillot', targetId: 'f', confirm: ['CYCLE', 7, null] })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { warning: boolean }).warning).toBe(true);
    expect(linkCount()).toBe(0);
  });

  it('answers a hard refusal as { error, code } without the warning flag', async () => {
    addPerson('me', 2025);
    const res = await post(request({ type: 'parrainage', role: 'fillot', targetId: 'me' }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { warning?: boolean; code: string };
    expect(body.code).toBe('SELF');
    expect(body.warning).toBeUndefined();
  });

  it('links the same promotion on the first call', async () => {
    addPerson('me', 2025);
    addPerson('f', 2025);
    const res = await post(request({ type: 'parrainage', role: 'fillot', targetId: 'f' }));
    expect(res.status).toBe(200);
    expect(linkCount()).toBe(1);
  });
});
