#!/usr/bin/env bun
/**
 * Boots the PACKAGED server (`build/index.js`, adapter-bun) against a throwaway database and asks it
 * the questions a build cannot answer: does it start, does `bun:sqlite` open the file at RUNTIME,
 * and does a route that reads the database answer from it.
 *
 * A build proves the adapter produced something; only a boot proves it runs. `/api/health` alone is
 * not enough - it never touches the database - so this seeds one person and one session and asks
 * `/api/graph` (behind the session gate) for that person back, then checks the public home page
 * renders and builds its absolute URLs with `https` behind the reverse proxy.
 *
 * Usage: bun scripts/boot-smoke.js [port]   (run from the repository root, after `bun run build`)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database } from 'bun:sqlite';

const root = process.cwd();
const port = Number(process.argv[2] || 3399);
const base = `http://127.0.0.1:${port}`;
// The server resolves `database/sky.db` against its CWD, so a scratch CWD keeps real data out of it.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sky-boot-'));
fs.mkdirSync(path.join(scratch, 'database'));
fs.copyFileSync(
  path.join(root, 'database', 'schema.sql'),
  path.join(scratch, 'database', 'schema.sql')
);
// The start-up scripts locate the database from their OWN directory (`../database/sky.db`), so they
// run from a copy inside the scratch tree rather than from the repository.
fs.cpSync(path.join(root, 'scripts'), path.join(scratch, 'scripts'), { recursive: true });

/** Runs one of the production start-up scripts in the scratch CWD, failing on a non-zero exit. */
function runScript(name) {
  console.log(`[smoke] ${name}`);
  const result = Bun.spawnSync([process.execPath, path.join(scratch, 'scripts', name)], {
    cwd: scratch,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) {
    throw new Error(`${name} exited ${result.exitCode}`);
  }
}

/** Stops the server and removes the scratch directory, whatever happened. */
let server;
async function cleanup() {
  server?.kill();
  // The open database file cannot be removed on Windows until the process has really exited.
  await server?.exited;
  fs.rmSync(scratch, { recursive: true, force: true });
}

/** Fails the smoke with a message naming what was expected. */
function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  // The same chain the container runs before `bun build/index.js` (see the Dockerfile CMD).
  for (const script of [
    'init-db.js',
    'migrate-auth.js',
    'rebuild-db.js',
    'migrate-drop-dead-schema.js',
  ]) {
    runScript(script);
  }

  // One ICM member with a live session: the gate lets `/api/graph` through only for that.
  const db = new Database(path.join(scratch, 'database', 'sky.db'));
  db.prepare(
    `INSERT INTO people (id, first_name, last_name, level, formation, role)
     VALUES ('smoke-1', 'Smoke', 'Test', 2024, 'ICM', 'user')`
  ).run();
  db.prepare(`INSERT INTO sessions (token, person_id, expires_at) VALUES (?, 'smoke-1', ?)`).run(
    'smoke-token',
    Math.floor(Date.now() / 1000) + 3600
  );
  db.close();

  server = Bun.spawn([process.execPath, path.join(root, 'build', 'index.js')], {
    cwd: scratch,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
      MICONNECT_BASE_URL: 'https://idp.example.test',
      MICONNECT_CLIENT_ID: 'smoke',
      MICONNECT_CLIENT_SECRET: 'smoke',
      MIGALLERY_API_KEY: 'smoke',
    },
    stdout: 'inherit',
    stderr: 'inherit',
  });

  let healthy = false;
  for (let i = 0; i < 30 && !healthy; i++) {
    try {
      healthy = (await fetch(`${base}/api/health`)).status === 200;
    } catch {
      // not listening yet
    }
    if (!healthy) {
      await Bun.sleep(1000);
    }
  }
  expect(healthy, 'the packaged server never answered /api/health');
  console.log('[smoke] /api/health answered');

  const home = await fetch(`${base}/`, { headers: { host: 'sky.example.test' } });
  const html = await home.text();
  expect(home.status === 200, `GET / answered ${home.status}`);
  // Parsed, not substring-matched: the canonical link and og:url must BE the https origin the
  // adapter derived from Host, not merely mention it somewhere in the document.
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];
  const ogUrl = html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]*)"/)?.[1];
  expect(
    canonical !== undefined && new URL(canonical).origin === 'https://sky.example.test',
    `the canonical link is not on the public https origin: ${canonical}`
  );
  expect(
    ogUrl !== undefined && new URL(ogUrl).origin === 'https://sky.example.test',
    `og:url is not on the public https origin: ${ogUrl}`
  );
  console.log('[smoke] / rendered');

  const graph = await fetch(`${base}/api/graph`, {
    headers: { cookie: 'sky_session=smoke-token' },
  });
  const body = await graph.json();
  expect(graph.status === 200, `GET /api/graph answered ${graph.status}: ${JSON.stringify(body)}`);
  expect(
    body.people?.['smoke-1']?.prenom === 'Smoke',
    'bun:sqlite did not return the seeded person'
  );
  console.log('[smoke] /api/graph read the seeded row through bun:sqlite');

  // The sign-in start is the one redirect to ANOTHER origin. SvelteKit 3 turns it into a 500 unless
  // the identity provider's origin is allowlisted, and nothing else here ever requested it.
  const login = await fetch(`${base}/auth/login`, { redirect: 'manual' });
  const loginLocation = login.headers.get('location');
  expect(login.status === 302, `GET /auth/login answered ${login.status}, not 302`);
  expect(
    loginLocation !== null &&
      new URL(loginLocation).origin === 'https://idp.example.test' &&
      new URL(loginLocation).pathname === '/application/o/authorize/',
    `/auth/login redirected to ${loginLocation}, not the configured identity provider`
  );
  const stateCookie = login.headers.getSetCookie().find((c) => c.startsWith('__oidc_state='));
  expect(
    stateCookie !== undefined && /;\s*Secure/i.test(stateCookie) && /HttpOnly/i.test(stateCookie),
    `the OIDC state cookie is missing or not Secure/HttpOnly: ${stateCookie}`
  );
  console.log('[smoke] /auth/login redirects to the configured identity provider');

  // The callback refuses a return whose state is not the one the cookie holds (a 400, not a redirect).
  const callback = await fetch(`${base}/auth/callback?code=x&state=forged`, { redirect: 'manual' });
  expect(callback.status === 400, `a forged callback state answered ${callback.status}, not 400`);
  console.log('[smoke] /auth/callback refuses a forged state');

  const anonymous = await fetch(`${base}/api/graph`);
  expect(anonymous.status === 401, `an anonymous /api/graph answered ${anonymous.status}, not 401`);
  console.log('[smoke] the session gate refuses an anonymous request');
  // The CSRF check compares `Origin` with the origin the adapter derives (Host header + https).
  // `ORIGIN` no longer exists to pin it, so both sides of the comparison are asserted.
  const logout = (origin) =>
    fetch(`${base}/auth/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        host: 'sky.example.test',
        origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: '',
    });
  const same = await logout('https://sky.example.test');
  expect(
    same.status === 302 && same.headers.get('location') === '/',
    `a same-origin logout answered ${same.status} to ${same.headers.get('location')}, not 302 to /`
  );
  const cross = await logout('https://evil.example.test');
  expect(cross.status === 403, `a cross-origin POST answered ${cross.status}, not 403`);
  // SvelteKit 3 also refuses a mutative request that carries no Content-Type and no matching Origin.
  // Sky's own body-less fetches (admin/people DELETE, the recalc POST) depend on Origin being
  // exactly https://<Host>, so a body-less DELETE is asserted on both sides: a matching Origin gets
  // past the CSRF check and reaches the session gate (401), anything else is refused (403).
  const bodyless = (headers) =>
    fetch(`${base}/api/admin/people/smoke-1`, {
      method: 'DELETE',
      headers: { host: 'sky.example.test', ...headers },
    });
  const deleteSame = await bodyless({ origin: 'https://sky.example.test' });
  expect(
    deleteSame.status === 401,
    `a body-less same-origin DELETE answered ${deleteSame.status}, not the gate's 401`
  );
  const deleteBare = await bodyless({});
  expect(
    deleteBare.status === 403,
    `a body-less DELETE with no Origin answered ${deleteBare.status}, not 403`
  );
  console.log('[smoke] the CSRF check accepts the public origin and refuses another');
  // A real SIGTERM, the way `docker stop` stops the container: the server must drain and EXIT on
  // its own. Left to adapter-bun alone, one live timer or stream keeps the process up until the
  // grace period ends in a SIGKILL. (On Windows kill() is a hard terminate, so this proves the
  // exit path only on Linux, which is where CI and the container run.)
  server.kill('SIGTERM');
  const exited = await Promise.race([server.exited, Bun.sleep(10_000).then(() => 'timeout')]);
  expect(exited !== 'timeout', 'the server did not exit within 10 s of SIGTERM');
  if (process.platform !== 'win32') {
    expect(exited === 0, `the server exited ${exited} on SIGTERM, not 0`);
  }
  console.log('[smoke] SIGTERM -> clean exit');
  console.log('[smoke] OK');
} catch (error) {
  console.error('[smoke] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
