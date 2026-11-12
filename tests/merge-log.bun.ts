/**
 * A merge and the record of who made it are ONE transaction, on a real database: the module is
 * loaded with the working directory moved to a throwaway folder holding the real `schema.sql`, so
 * `database/sky.db` is created there and nothing of the developer's is touched.
 *
 * Run by `bun test` (`bun run test:db`), not by vitest: the database module opens `bun:sqlite`,
 * which exists only under the Bun runtime, and the vitest suite runs under Node (ci.yml says why).
 * The `.bun.ts` name keeps it out of vitest's pattern.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import type { RequestEvent } from '@sveltejs/kit';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type MergeEvent = RequestEvent<Record<string, never>, '/api/admin/merge'>;
type Db = typeof import('#lib/server/database.js');

const realRoot = process.cwd();
let root: string;
let database: Db;
let mergePost: (event: MergeEvent) => Promise<Response> | Response;

/** The rows of the merge log, oldest first. */
function logRows(): Array<{ merged_by: string; removed_id: string; kept_id: string }> {
  return database
    .getDatabase()
    .prepare('SELECT merged_by, removed_id, kept_id FROM merge_log ORDER BY id')
    .all() as Array<{ merged_by: string; removed_id: string; kept_id: string }>;
}

function fichesIds(): string[] {
  const rows = database.getDatabase().prepare('SELECT id FROM people ORDER BY id').all() as Array<{
    id: string;
  }>;
  return rows.map((r) => r.id);
}

/** A merge request as the route receives it, from the admin `admin`. */
function mergeEvent(body: unknown): MergeEvent {
  return {
    request: new Request('http://sky.test/api/admin/merge', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    locals: { user: { id: 'admin', role: 'admin' } },
  } as unknown as MergeEvent;
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-merge-log-'));
  fs.mkdirSync(path.join(root, 'database'));
  fs.copyFileSync(
    path.join(realRoot, 'database', 'schema.sql'),
    path.join(root, 'database', 'schema.sql')
  );
  // The database path is read from the working directory when the module loads.
  process.chdir(root);
  database = await import('#lib/server/database.js');
  expect(database.DB_PATH.startsWith(root)).toBe(true);
  mergePost = (await import('../src/routes/api/admin/merge/+server')).POST as typeof mergePost;
});

afterAll(() => {
  database.closeDatabase();
  process.chdir(realRoot);
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch (e) {
    // Windows keeps the database file locked for a moment after close; the folder is in the OS
    // temporary directory, so a leftover is harmless and not a reason to fail the run.
    console.warn('[merge-log test] temporary folder not removed:', (e as Error).message);
  }
});

beforeEach(() => {
  const db = database.getDatabase();
  db.exec('DROP TRIGGER IF EXISTS refuse_people_update');
  db.exec('DELETE FROM merge_log; DELETE FROM relationships; DELETE FROM people;');
  const person = db.prepare(
    "INSERT INTO people (id, first_name, last_name, role) VALUES (?, 'Camille', 'PERRIN', ?)"
  );
  person.run('admin', 'admin');
  person.run('kept', 'user');
  person.run('removed', 'user');
});

describe('a merge and its record', () => {
  it('writes exactly one row, with the admin, the fiche removed and the fiche kept', async () => {
    const response = await mergePost(mergeEvent({ sourceId: 'removed', targetId: 'kept' }));

    expect(response.status).toBe(200);
    expect(logRows()).toEqual([{ merged_by: 'admin', removed_id: 'removed', kept_id: 'kept' }]);
    expect(fichesIds()).toEqual(['admin', 'kept']);
  });

  it('leaves no row, and both fiches, when the update of the survivor fails', async () => {
    database
      .getDatabase()
      .exec(
        "CREATE TRIGGER refuse_people_update BEFORE UPDATE ON people BEGIN SELECT RAISE(ABORT, 'refused'); END"
      );

    const response = await mergePost(
      mergeEvent({
        sourceId: 'removed',
        targetId: 'kept',
        resolution: { prenom: 'Camille', nom: 'Perrin', level: null },
      })
    );

    expect(response.status).toBe(500);
    expect(logRows()).toEqual([]);
    expect(fichesIds()).toEqual(['admin', 'kept', 'removed']);
  });

  it.each([
    ['the fiche to remove', { sourceId: 'nobody', targetId: 'kept' }],
    ['the fiche to keep', { sourceId: 'removed', targetId: 'nobody' }],
  ])('writes no row and answers 404 when %s does not exist', async (_what, body) => {
    const response = await mergePost(mergeEvent(body));

    expect(response.status).toBe(404);
    expect(logRows()).toEqual([]);
    expect(fichesIds()).toEqual(['admin', 'kept', 'removed']);
  });
});
