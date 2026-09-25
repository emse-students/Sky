/**
 * The home page's two paths to a member's own sheet: the LANDING (the graph loads, the member's
 * star is selected) and "go to my star". Both must leave a `[role="dialog"]` - the person sheet -
 * on screen. A pure test of `decideLanding` passed while the real page opened no sheet at all.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { get, readable } from 'svelte/store';
import { PHONE_CHIP_BOTTOM } from '$stores/mapActions';
import { sheetHeight } from '$lib/utils/sheet';
import { m } from '$lib/paraglide/messages';

vi.mock('$app/stores', () => ({
  page: readable({
    data: { user: { id: 'me', profile_id: 'me', name: 'ME Myself', role: 'user' }, canariUrl: '' },
    url: new URL('http://localhost/'),
  }),
}));

const graph = {
  people: {
    me: { id: 'me', level: 2024, prenom: 'Myself', nom: 'Me' },
    p: { id: 'p', level: 2023, prenom: 'Parrain', nom: 'Par' },
    f: { id: 'f', level: 2025, prenom: 'Fillot', nom: 'Fil' },
  },
  relationships: [
    { source: 'p', target: 'me', type: 'parrainage' },
    { source: 'me', target: 'f', type: 'parrainage' },
  ],
};
const positions = { me: { x: 0, y: 0 }, p: { x: -100, y: -200 }, f: { x: 100, y: 200 } };

/** A 2D context that draws nothing: jsdom has no canvas, and the page only needs to mount. */
function fakeContext(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_t, key) =>
        key === 'measureText' ? () => ({ width: 40 }) : () => ({ addColorStop: () => {} }),
      set: () => true,
    }
  ) as CanvasRenderingContext2D;
}

let host: HTMLElement;
let component: Record<string, unknown>;
let cameraStore: typeof import('$stores/cameraStore').cameraStore;
let svelte: typeof import('svelte');

async function settle() {
  for (let i = 0; i < 5; i++) {
    await svelte.tick();
    await new Promise((r) => setTimeout(r, 0));
    svelte.flushSync();
  }
}

beforeEach(async () => {
  window.innerWidth = 393;
  window.innerHeight = 760;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeContext() as unknown as RenderingContext
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/graph')) return Response.json(graph);
      if (url.startsWith('/api/positions')) return Response.json(positions);
      return new Response('{}', { status: 404 });
    })
  );
  // Fresh stores for every test: a graph left loaded by the previous test lands the member during
  // mount rather than on the load, which is a different flush - and it hid the frozen-links defect.
  vi.resetModules();
  // The runtime is re-imported too, or the page and `mount` would hold two different ones.
  svelte = await import('svelte');
  ({ cameraStore } = await import('$stores/cameraStore'));
  const Page = (await import('./+page.svelte')).default;
  host = document.createElement('div');
  document.body.appendChild(host);
  component = svelte.mount(Page, { target: host });
  await settle();
}, 60_000);

afterEach(() => {
  svelte.unmount(component);
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('home page - the member’s own sheet', () => {
  it('opens the sheet on landing, on the member’s star', () => {
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('#profile-name')?.textContent).toContain('ME Myself');
  });

  it('lists the member’s godparent and godchild in the landing sheet, not the empty state', () => {
    const names = [...host.querySelectorAll('.link-name')].map((n) => n.textContent);
    expect(names).toEqual(['PAR Parrain', 'FIL Fillot']);
    expect(host.textContent).not.toContain(m.profile_no_links());
  });

  it('frames the member’s star at the centre of the band between the chip and the peek', () => {
    const cam = get(cameraStore);
    const screenY = (positions.me.y - cam.y) * cam.zoom + window.innerHeight / 2;
    const screenX = (positions.me.x - cam.x) * cam.zoom + window.innerWidth / 2;
    const peek = sheetHeight('peek', window.innerHeight);
    expect(screenX).toBeCloseTo(window.innerWidth / 2);
    expect(screenY).toBeCloseTo(
      PHONE_CHIP_BOTTOM + (window.innerHeight - PHONE_CHIP_BOTTOM - peek) / 2
    );
  });

  it('reopens the sheet from "go to my star" after it was dismissed', async () => {
    host
      .querySelector<HTMLButtonElement>(`button[aria-label="${m.common_close()}"].close`)!
      .click();
    await settle();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    host.querySelector<HTMLButtonElement>(`button[aria-label="${m.map_me()}"]`)!.click();
    await settle();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
