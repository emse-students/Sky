/**
 * The step-up (`src/lib/server/handoff/step-up.ts`): a session a Canari handoff opened may browse
 * and may change nothing until a MiConnect sign-in. Pinned against the REAL route tree: every
 * handler and every form action that changes state is refused to a marked session unless it is on
 * the exemption list, and every exemption names a route that exists - so a route added tomorrow is
 * guarded without anyone remembering it, and a stale exemption cannot linger.
 *
 * The tree is read as source rather than imported: a route module pulls in the database, which
 * needs `bun:sqlite`, absent under this Node suite. The pattern matches every way a module can
 * export a handler (`export const`, `export function`, `export async function`, `export { X }`).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { STEP_UP_EXEMPT, stepUpRequired, stepUpResponse } from '../src/lib/server/handoff/step-up';
import { isStepUpRefusal, STEP_UP_CODE, STEP_UP_LOGIN_PATH } from '../src/lib/step-up';

const ROUTES = join(__dirname, '..', 'src', 'routes');
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
/** SvelteKit's `fallback` answers every method a module does not name, writes included. */
const EXPORT =
  /export\s+(?:const|let|var|async\s+function|function)\s+(POST|PUT|PATCH|DELETE|fallback|actions)\b|export\s*\{([^}]*)\}/g;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return name === '+server.ts' || name === '+page.server.ts' ? [p] : [];
  });
}

/** The URL path a route file answers, with each parameter given a sample value. */
function pathOf(file: string): string {
  const parts = relative(ROUTES, file)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith('[...') ? 'a/b' : s.startsWith('[') ? 'sample' : s));
  return `/${parts.join('/')}`;
}

/** The state-changing methods a route file exports. A form action is a POST to its page. */
function writesOf(file: string): string[] {
  const names = new Set<string>();
  for (const match of readFileSync(file, 'utf-8').matchAll(EXPORT)) {
    if (match[1]) names.add(match[1]);
    for (const item of (match[2] ?? '').split(',')) {
      const exported = item
        .trim()
        .split(/\s+as\s+/)
        .pop();
      if (exported) names.add(exported);
    }
  }
  const methods = WRITE_METHODS.filter((m) => names.has(m));
  if (names.has('actions')) methods.push('POST');
  if (names.has('fallback')) methods.push(...WRITE_METHODS);
  return [...new Set(methods)];
}

const writing = routeFiles(ROUTES)
  .map((f) => ({ path: pathOf(f), methods: writesOf(f) }))
  .filter((r) => r.methods.length > 0);

describe('the step-up guard', () => {
  it('finds the state-changing routes (the enumeration is not empty)', () => {
    expect(writing.length).toBeGreaterThan(10);
  });

  it('refuses every state-changing route to a marked session, except the listed exemptions', () => {
    const letThrough: string[] = [];
    for (const r of writing) {
      for (const m of r.methods) {
        if (!stepUpRequired(m, r.path, true) && !STEP_UP_EXEMPT.has(r.path)) {
          letThrough.push(`${m} ${r.path}`);
        }
      }
    }
    expect(letThrough).toEqual([]);
  });

  it('guards the actions the design names, by path', () => {
    for (const [method, p] of [
      // record linking and profile edits
      ['POST', '/account'],
      ['PUT', '/api/relatives/sample'],
      ['DELETE', '/api/relatives/sample'],
      ['POST', '/api/relationships'],
      ['DELETE', '/api/relationships'],
      // the admin's writes
      ['POST', '/api/admin/people'],
      ['PATCH', '/api/admin/people/sample'],
      ['POST', '/api/admin/merge'],
      ['POST', '/api/admin/import'],
    ]) {
      expect([method, p, stepUpRequired(method, p, true)]).toEqual([method, p, true]);
    }
  });

  it('names, for every exemption, a state-changing route that exists', () => {
    for (const path of STEP_UP_EXEMPT.keys()) {
      expect([path, writing.some((r) => r.path === path)]).toEqual([path, true]);
    }
  });

  it('never touches an unmarked session, nor a read', () => {
    for (const r of writing) {
      for (const m of r.methods) expect(stepUpRequired(m, r.path, false)).toBe(false);
      expect(stepUpRequired('GET', r.path, true)).toBe(false);
      expect(stepUpRequired('HEAD', r.path, true)).toBe(false);
    }
  });
});

describe('the refusal', () => {
  it('a fetch gets a 403 the browser recognises without reading its body', async () => {
    const res = stepUpResponse(new Request('https://sky.example/api/x', { method: 'POST' }));
    expect(res.status).toBe(403);
    expect(isStepUpRefusal(res)).toBe(true);
    expect(await res.json()).toEqual({ code: STEP_UP_CODE });
  });

  it('an enhanced form action gets a redirect ActionResult to the MiConnect sign-in', async () => {
    const res = stepUpResponse(
      new Request('https://sky.example/account?/relink', {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
      })
    );
    expect(res.status).toBe(200);
    expect(isStepUpRefusal(res)).toBe(true);
    expect(await res.json()).toEqual({
      type: 'redirect',
      status: 303,
      location: STEP_UP_LOGIN_PATH,
    });
  });

  it('a form posted without JavaScript is sent to the MiConnect sign-in', () => {
    const res = stepUpResponse(
      new Request('https://sky.example/account?/relink', {
        method: 'POST',
        headers: { accept: 'text/html,application/xhtml+xml' },
      })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(STEP_UP_LOGIN_PATH);
  });

  it('an ordinary 403 is not the step-up', () => {
    expect(isStepUpRefusal(new Response('{}', { status: 403 }))).toBe(false);
  });
});
