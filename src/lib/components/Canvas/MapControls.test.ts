/**
 * The map controls move the camera TARGET (buttons ease, they are not gestures): + / - compound
 * from the target, and fit frames what is displayed.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import MapControls from './MapControls.svelte';
import { cameraStore } from '$stores/cameraStore';
import { graphStore, selectedPersonId } from '$stores/graphStore';
import { FIT_FILL } from '$lib/utils/camera';

let host: HTMLElement;
let component: Record<string, unknown>;

function render(props: Record<string, unknown> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  component = mount(MapControls, { target: host, props });
  flushSync();
}

function press(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`no button labelled ${label}`);
  button.click();
  flushSync();
}

beforeEach(async () => {
  window.innerWidth = 400;
  window.innerHeight = 800;
  selectedPersonId.set(null);
  // The store has no setter: feed it through its one entry point, the two API reads.
  const graph = {
    people: {
      a: { id: 'a', level: 2020, prenom: 'A', nom: 'A' },
      b: { id: 'b', level: 2021, prenom: 'B', nom: 'B' },
    },
    relationships: [],
  };
  const positions = { a: { x: -100, y: 0 }, b: { x: 100, y: 0 } };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => Response.json(url.startsWith('/api/graph') ? graph : positions))
  );
  await graphStore.load();
  cameraStore.jumpTo({ x: 0, y: 0, zoom: 1 });
});

afterEach(() => {
  unmount(component);
  host.remove();
  vi.unstubAllGlobals();
});

describe('MapControls', () => {
  it('+ doubles the target zoom, and two presses compound from the target', () => {
    render();
    press('Zoomer');
    expect(get(cameraStore).targetZoom).toBe(2);
    press('Zoomer');
    expect(get(cameraStore).targetZoom).toBe(4);
    // The view itself eases toward it: a button is not a gesture.
    expect(get(cameraStore).zoom).toBe(1);
  });

  it('- halves the target zoom, and stops at the zoom-out bound of the graph', () => {
    cameraStore.jumpTo({ x: 0, y: 0, zoom: 4 });
    render();
    press('Dézoomer');
    expect(get(cameraStore).targetZoom).toBe(2);
    // The graph fits at x2 (200 world px on 400 screen px): the floor is half of that.
    press('Dézoomer');
    press('Dézoomer');
    expect(get(cameraStore).targetZoom).toBe(1);
  });

  it('fit frames every displayed star', () => {
    render();
    press('Recentrer la carte');
    const cam = get(cameraStore);
    expect(cam.targetX).toBe(0);
    expect(cam.targetZoom).toBeCloseTo((400 * FIT_FILL) / 200);
  });

  it('shows "my star" only when there is one, and runs it', () => {
    render();
    expect(host.querySelector('button[aria-label="Aller à mon étoile"]')).toBeNull();
    unmount(component);
    host.remove();
    let called = 0;
    render({ onMe: () => called++ });
    press('Aller à mon étoile');
    expect(called).toBe(1);
  });

  it('the legend toggles and reports its state', () => {
    render();
    const toggle = host.querySelector<HTMLButtonElement>('button[aria-label="Légende"]')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    press('Légende');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#map-legend')).not.toBeNull();
  });
});
