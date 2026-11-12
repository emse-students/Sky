/**
 * The confirm dialog from the keyboard: the focus opens on the button that changes nothing, Enter
 * activates the button that holds it and nothing else, Tab stays inside, Escape cancels, and the
 * focus returns to where it was.
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConfirmDialog from './ConfirmDialog.svelte';
import { activeDialog, alertDialog, confirmDialog } from '#lib/stores/dialogStore.js';

let host: HTMLElement;
let component: Record<string, unknown>;
let opener: HTMLButtonElement;

beforeEach(() => {
  opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  host = document.createElement('div');
  document.body.appendChild(host);
  component = mount(ConfirmDialog, { target: host });
});

afterEach(() => {
  activeDialog.set(null);
  void unmount(component);
  host.remove();
  opener.remove();
});

const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('button'));

/** A key pressed on whatever holds the focus, as the browser sends it. */
function press(key: string, init: KeyboardEventInit = {}) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  );
  flushSync();
}

describe('the confirm dialog from the keyboard', () => {
  it('opens with the focus on Cancel, and Enter there does not confirm', async () => {
    const answer = confirmDialog('Delete this fiche?', { danger: true });
    flushSync();

    const [cancel] = buttons();
    expect(document.activeElement).toBe(cancel);

    // Enter on a focused button is the button's own activation; the dialog adds nothing to it.
    press('Enter');
    expect(host.querySelector('[role="alertdialog"]')).not.toBeNull();

    cancel.click();
    expect(await answer).toBe(false);
  });

  it('confirms only through the confirm button', async () => {
    const answer = confirmDialog('Delete this fiche?');
    flushSync();

    buttons()[1].click();
    expect(await answer).toBe(true);
  });

  it('keeps Tab among its buttons, both ways', () => {
    void confirmDialog('Delete this fiche?');
    flushSync();
    const [cancel, confirm] = buttons();

    press('Tab');
    expect(document.activeElement).toBe(confirm);
    press('Tab');
    expect(document.activeElement).toBe(cancel);
    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('cancels on Escape and gives the focus back', async () => {
    const answer = confirmDialog('Delete this fiche?');
    flushSync();

    press('Escape');
    expect(await answer).toBe(false);
    flushSync();
    expect(document.activeElement).toBe(opener);
  });

  it('names itself by its title and its message', () => {
    void confirmDialog('Delete this fiche?', { title: 'Deletion' });
    flushSync();

    const dialog = host.querySelector('[role="alertdialog"]')!;
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Deletion'
    );
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Delete this fiche?'
    );
  });

  it('an alert opens on its only button', async () => {
    const acknowledged = alertDialog('Saved.');
    flushSync();

    expect(document.activeElement).toBe(buttons()[0]);
    buttons()[0].click();
    await acknowledged;
  });
});
