/**
 * THE GATE THAT LETS THE MARKDOWN RENDERER BE UPGRADED WITHOUT A HUMAN.
 *
 * `BioMarkdown` renders text this application did not write: a bio authored by a student, fetched
 * from Canari. The component's own comment states the safety property it relies on - "SvelteMarkdown
 * renders through Svelte components and escapes raw HTML, so external bio text cannot inject
 * markup" - and until this file existed, NOTHING asserted it. That is the worst shape a security
 * property can be in: written down, believed, and unmeasured.
 *
 * It is also invisible to every other gate here. A `@humanspeak/svelte-markdown` major that started
 * passing raw HTML through would typecheck, lint, build and ship. The suite would be green and the
 * first person to find out would be whoever pasted a `<script>` into their bio.
 *
 * So this file exists to make an escaping regression RED, which is what lets the dependency merge
 * on its own the rest of the time.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BioMarkdown from './BioMarkdown.svelte';

let host: HTMLElement | null = null;
let component: Record<string, unknown> | null = null;

/**
 * Mounts the component on a detached element and returns it. Svelte 5 has no test-renderer of its
 * own and this repository carries no component-testing library; `mount` against jsdom is the whole
 * mechanism, and it needs no new dependency to gate a dependency.
 */
function render(source: string): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  component = mount(BioMarkdown, { target: host, props: { source } }) as Record<string, unknown>;
  flushSync();
  return host;
}

afterEach(() => {
  if (component) unmount(component);
  if (host) host.remove();
  component = null;
  host = null;
});

describe('BioMarkdown', () => {
  it('renders ordinary Markdown', () => {
    // The positive case is here so a renderer that escaped EVERYTHING - and would pass every
    // assertion below - still fails. A gate that only forbids is satisfied by rendering nothing.
    const el = render('A **bold** claim and a [link](https://example.org).');

    expect(el.querySelector('strong')?.textContent).toBe('bold');
    const anchor = el.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://example.org');
  });

  it('does not execute a script tag pasted into a bio', () => {
    const el = render('hello <script>window.__pwned = true;</script> there');

    expect(el.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    // The words around it must survive, and so must the payload - as TEXT. Silently dropping the
    // whole thing would also satisfy the two assertions above, while losing what the student
    // actually wrote. (The `<script>` tag itself is not echoed back; its content is.)
    expect(el.textContent).toContain('hello');
    expect(el.textContent).toContain('there');
    expect(el.textContent).toContain('window.__pwned = true;');
  });

  it('does not build an element out of an inline event handler', () => {
    const el = render('<img src="x" onerror="window.__pwned = true">');

    expect(el.querySelector('img')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('does not let raw HTML introduce markup of its own', () => {
    const el = render('<b>not bold</b> and <div id="injected"></div>');

    expect(el.querySelector('#injected')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toContain('not bold');
  });

  it('keeps a single newline as a line break, which is why the normalizer exists', () => {
    // `normalizeBioLineBreaks` turns one Enter into a hard break so a bio reads the same here as on
    // Canari. It is a regex with a lookbehind and it had no test either; a renderer that stopped
    // honouring two trailing spaces would silently reflow every bio into one paragraph.
    const el = render('line one\nline two');

    expect(el.querySelector('br')).not.toBeNull();
  });
});
