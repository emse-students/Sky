/**
 * The tree page says what happened: a tree that could not be read is not "no fiche", a link is
 * removed only after the person said yes, and a removal the server refused is reported.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync, tick } from 'svelte';
import { m } from '#lib/paraglide/messages.js';
import { activeDialog } from '#lib/stores/dialogStore.js';

vi.mock('$app/state', () => ({
  page: {
    data: { user: { id: 'me', name: 'ME Myself', role: 'user' }, canariUrl: '' },
    url: new URL('http://localhost/tree'),
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));

import Page from './+page.svelte';

const TREE = {
  person: { id: 'me', prenom: 'Myself', nom: 'Me', level: 2024 },
  parrains: [
    {
      relId: 7,
      kind: 'parrainage',
      id: 'p',
      prenom: 'Camille',
      nom: 'Perrin',
      level: 2023,
      linked: true,
    },
  ],
  fillots: [],
  maxParrains: { parrainage: 2, adoption: 1 },
  maxFillots: { parrainage: 2, adoption: 1 },
  canEdit: true,
};

/** What the server answers, per call; each test sets what it needs. */
let entourage: () => Response;
let removal: () => Response;
let orphanDeletion: () => Response;
const calls: { url: string; method: string }[] = [];

let host: HTMLElement;
let component: Record<string, unknown>;

async function settle() {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

async function render() {
  host = document.createElement('div');
  document.body.appendChild(host);
  component = mount(Page, { target: host });
  await settle();
}

beforeEach(() => {
  calls.length = 0;
  entourage = () => Response.json(TREE);
  removal = () => Response.json({ success: true, orphan: null });
  orphanDeletion = () => Response.json({ success: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });
      if (url.startsWith('/api/entourage')) return entourage();
      if (url === '/api/relationships' && method === 'DELETE') return removal();
      if (url.startsWith('/api/relatives/') && method === 'DELETE') return orphanDeletion();
      return new Response('{}', { status: 404 });
    })
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  activeDialog.set(null);
  void unmount(component);
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const removeButton = () =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${m.tree_remove_aria()}"]`)!;
const deletions = () => calls.filter((c) => c.method === 'DELETE');

/** Answer the dialog on screen, as the person would. */
async function answer(ok: boolean) {
  get(activeDialog)!.resolve(ok);
  activeDialog.set(null);
  await settle();
}

describe('a tree that could not be read', () => {
  it('says so and asks again on demand, instead of saying there is no fiche', async () => {
    entourage = () => new Response('{}', { status: 500 });
    await render();

    expect(host.textContent).toContain(m.tree_load_failed());
    expect(host.textContent).not.toContain(m.tree_no_fiche());

    entourage = () => Response.json(TREE);
    host.querySelector<HTMLButtonElement>('button.retry')!.click();
    await settle();

    expect(host.textContent).toContain('Camille');
    expect(host.textContent).not.toContain(m.tree_load_failed());
  });

  it('is the same when the network gives no answer', async () => {
    entourage = () => {
      throw new TypeError('fetch failed');
    };
    await render();

    expect(host.textContent).toContain(m.tree_load_failed());
  });

  it('still says there is no fiche when the server answers that', async () => {
    entourage = () => new Response('{}', { status: 404 });
    await render();

    expect(host.textContent).toContain(m.tree_no_fiche());
    expect(host.querySelector('button.retry')).toBeNull();
  });
});

describe('removing a link', () => {
  it('asks first, naming the person, and sends nothing when the answer is no', async () => {
    await render();
    removeButton().click();
    await settle();

    const dialog = get(activeDialog)!;
    expect(dialog.kind).toBe('confirm');
    expect(dialog.message).toBe(m.tree_remove_confirm({ name: 'Camille Perrin' }));
    expect(deletions()).toEqual([]);

    await answer(false);
    expect(deletions()).toEqual([]);
  });

  it('removes the link once the answer is yes', async () => {
    await render();
    removeButton().click();
    await settle();
    await answer(true);

    expect(deletions()).toEqual([{ url: '/api/relationships', method: 'DELETE' }]);
    expect(get(activeDialog)).toBeNull();
  });

  it('reports a removal the server refused, with the reason it gave', async () => {
    removal = () => Response.json({ error: 'Not allowed here' }, { status: 403 });
    await render();
    removeButton().click();
    await settle();
    await answer(true);

    const report = get(activeDialog)!;
    expect(report.kind).toBe('alert');
    expect(report.message).toBe('Not allowed here');
  });

  it('reports a removal that got no answer', async () => {
    removal = () => {
      throw new TypeError('fetch failed');
    };
    await render();
    removeButton().click();
    await settle();
    await answer(true);

    expect(get(activeDialog)!.message).toBe(m.tree_remove_failed());
  });

  it('reports the orphan it could not delete as a deletion, not as a removal', async () => {
    removal = () =>
      Response.json({ success: true, orphan: { id: 'o', prenom: 'Sasha', nom: 'Morel' } });
    orphanDeletion = () => {
      throw new TypeError('fetch failed');
    };
    await render();
    removeButton().click();
    await settle();
    await answer(true);
    expect(get(activeDialog)!.message).toBe(m.tree_orphan_confirm({ name: 'Sasha Morel' }));
    await answer(true);

    expect(get(activeDialog)!.kind).toBe('alert');
    expect(get(activeDialog)!.message).toBe(m.tree_delete_failed());
  });
});
