/**
 * The map controls move the camera TARGET (buttons ease, they are not gestures): + / - compound
 * from the target, and fit leaves focus and shows the whole sky. Buttons are found by their message, never a
 * literal: the locale a run resolves is not this file's to assume (CI resolves English).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { get } from 'svelte/store';
import MapControls from './MapControls.svelte';
import { cameraStore } from '$stores/cameraStore';
import { graphStore, selectedPersonId } from '$stores/graphStore';
import { FIT_FILL } from '$lib/utils/camera';
import { m } from '$lib/paraglide/messages';

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
    press(m.map_zoom_in());
    expect(get(cameraStore).targetZoom).toBe(2);
    press(m.map_zoom_in());
    expect(get(cameraStore).targetZoom).toBe(4);
    // The view itself eases toward it: a button is not a gesture.
    expect(get(cameraStore).zoom).toBe(1);
  });

  it('- halves the target zoom, and stops at the zoom-out bound of the graph', () => {
    cameraStore.jumpTo({ x: 0, y: 0, zoom: 4 });
    render();
    press(m.map_zoom_out());
    expect(get(cameraStore).targetZoom).toBe(2);
    // The graph fits at x2 (200 world px on 400 screen px): the floor is half of that.
    press(m.map_zoom_out());
    press(m.map_zoom_out());
    expect(get(cameraStore).targetZoom).toBe(1);
  });

  it('fit leaves focus and frames every star', () => {
    selectedPersonId.set('a');
    render();
    press(m.map_fit());
    expect(get(selectedPersonId)).toBeNull();
    const cam = get(cameraStore);
    expect(cam.targetX).toBe(0);
    expect(cam.targetZoom).toBeCloseTo((400 * FIT_FILL) / 200);
  });

  it('shows "my star" only when there is one, and runs it', () => {
    render();
    expect(host.querySelector(`button[aria-label="${m.map_me()}"]`)).toBeNull();
    unmount(component);
    host.remove();
    let called = 0;
    render({ onMe: () => called++ });
    press(m.map_me());
    expect(called).toBe(1);
  });

  it('the legend toggles and reports its state', () => {
    render();
    const toggle = host.querySelector<HTMLButtonElement>(`button[aria-label="${m.map_legend()}"]`)!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    press(m.map_legend());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('#map-legend')).not.toBeNull();
  });

  it('shows the filled search disc only when given a search action, and runs it', () => {
    render();
    expect(host.querySelector('button.search')).toBeNull();
    unmount(component);
    host.remove();
    let opened = 0;
    render({ onSearch: () => opened++ });
    press(m.home_search_label());
    expect(opened).toBe(1);
  });
});
