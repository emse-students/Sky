/**
 * The modal's promo-warning flow: a `{ warning: true, code }` answer opens the confirm dialog with
 * the server's localized message; yes re-sends the SAME request with `confirm: [code]`, no sends
 * nothing more. Classified by `code`, never by message.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { mount, unmount, flushSync, tick } from 'svelte';
import { m } from '#lib/paraglide/messages.js';
import { activeDialog } from '#lib/stores/dialogStore.js';
import AddRelativeModal from './AddRelativeModal.svelte';

const WARNING = { warning: true, code: 'PROMO_GAP', error: 'Warning: too far apart.' };
const bodies: Record<string, unknown>[] = [];
let answers: Response[];
let host: HTMLElement;
let component: Record<string, unknown>;
const onAdded = vi.fn();

async function settle() {
  for (let i = 0; i < 5; i++) {
    await tick();
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
}

beforeEach(() => {
  bodies.length = 0;
  onAdded.mockReset();
  answers = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith('/api/search')) {
        return Response.json({ results: [{ id: 'f', prenom: 'Fil', nom: 'Lot', level: 2026 }] });
      }
      bodies.push(JSON.parse(String(init?.body)));
      return answers.shift() ?? new Response('{}', { status: 500 });
    })
  );
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  activeDialog.set(null);
  void unmount(component);
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Mount the modal and click the first existing-person result's link button. */
async function linkFirstResult() {
  component = mount(AddRelativeModal, {
    target: host,
    props: { role: 'fillot', kind: 'parrainage', title: 'Add', onClose: () => {}, onAdded },
  });
  await settle();
  const input = host.querySelector<HTMLInputElement>('input[type="text"], input[type="search"]')!;
  input.value = 'fil';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  host.querySelector<HTMLButtonElement>('.result, .results button, li button')!.click();
  await settle();
}

describe('promo warning flow', () => {
  it('shows the warning, and re-sends with the acknowledged code on yes', async () => {
    answers = [Response.json(WARNING, { status: 409 }), Response.json({ success: true })];
    await linkFirstResult();

    const dialog = get(activeDialog)!;
    expect(dialog.message).toBe(WARNING.error);
    expect(dialog.confirmLabel).toBe(m.rel_warn_confirm());
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).not.toHaveProperty('confirm');

    dialog.resolve(true);
    activeDialog.set(null);
    await settle();

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ targetId: 'f', confirm: ['PROMO_GAP'] });
    expect(onAdded).toHaveBeenCalledOnce();
  });

  it('sends nothing more on no', async () => {
    answers = [Response.json(WARNING, { status: 409 })];
    await linkFirstResult();

    get(activeDialog)!.resolve(false);
    activeDialog.set(null);
    await settle();

    expect(bodies).toHaveLength(1);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('shows a hard refusal as an error, with no dialog', async () => {
    answers = [Response.json({ error: 'Cycle', code: 'CYCLE' }, { status: 409 })];
    await linkFirstResult();

    expect(get(activeDialog)).toBeNull();
    expect(host.textContent).toContain('Cycle');
  });
});
