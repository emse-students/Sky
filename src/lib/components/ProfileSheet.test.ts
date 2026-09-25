/**
 * The phone sheet opens at its PEEK, moves between states from the keyboard, reports how much of
 * the screen it covers, and closes on Escape. (Drag physics are pinned in `utils/sheet.test.ts`.)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, createRawSnippet } from 'svelte';
import ProfileSheet from './ProfileSheet.svelte';
import { sheetHeight } from '$lib/utils/sheet';

let host: HTMLElement;
let component: Record<string, unknown>;

const children = createRawSnippet(() => ({ render: () => '<h2 id="who">Someone</h2>' }));

function render(mobile: boolean) {
  const state = { closed: 0, covered: -1 };
  host = document.createElement('div');
  document.body.appendChild(host);
  component = mount(ProfileSheet, {
    target: host,
    props: {
      mobile,
      labelledBy: 'who',
      onClose: () => state.closed++,
      children,
      get covered() {
        return state.covered;
      },
      set covered(v: number) {
        state.covered = v;
      },
    },
  });
  flushSync();
  return state;
}

function sheet() {
  return host.querySelector<HTMLElement>('[role="dialog"]')!;
}

afterEach(() => {
  unmount(component);
  host.remove();
});

describe('ProfileSheet', () => {
  it('opens at the peek on a phone, names itself, and takes focus', () => {
    const state = render(true);
    const peek = sheetHeight('peek', window.innerHeight);
    expect(sheet().style.height).toBe(`${peek}px`);
    expect(state.covered).toBe(peek);
    expect(sheet().getAttribute('aria-labelledby')).toBe('who');
    expect(document.activeElement).toBe(sheet());
  });

  it('steps up and down from the handle with the arrow keys', () => {
    render(true);
    const handle = host.querySelector<HTMLButtonElement>('.handle')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    flushSync();
    expect(sheet().style.height).toBe(`${sheetHeight('half', window.innerHeight)}px`);
    expect(handle.getAttribute('aria-expanded')).toBe('true');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    flushSync();
    expect(sheet().style.height).toBe(`${sheetHeight('peek', window.innerHeight)}px`);
  });

  it('toggles peek / full on a keyboard activation of the handle', () => {
    render(true);
    host.querySelector<HTMLButtonElement>('.handle')!.click();
    flushSync();
    expect(sheet().style.height).toBe(`${sheetHeight('full', window.innerHeight)}px`);
  });

  it('closes on Escape and on the close button', () => {
    const state = render(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(state.closed).toBe(1);
    host.querySelector<HTMLButtonElement>('.close')!.click();
    expect(state.closed).toBe(2);
  });

  it('is a drawer on desktop: no handle, covers nothing at the bottom', () => {
    const state = render(false);
    expect(host.querySelector('.handle')).toBeNull();
    expect(sheet().style.height).toBe('');
    expect(state.covered).toBe(0);
  });
});
