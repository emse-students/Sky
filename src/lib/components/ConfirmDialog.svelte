<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { activeDialog, type DialogRequest } from '#lib/stores/dialogStore.js';
  import { m } from '#lib/paraglide/messages.js';

  /**
   * Global host for in-app confirm/alert modals. Rendered once at the app root;
   * it displays whatever `confirmDialog()` / `alertDialog()` pushed to the store
   * and resolves the awaiting caller on the user's choice. Replaces the native
   * browser `confirm()` / `alert()` windows.
   */

  /** What held the focus when the dialog opened; it gets it back when the dialog is answered. */
  let focusedBefore: HTMLElement | null = null;

  /**
   * Resolve the active dialog with the given outcome and close it. The focus returns HERE, at the
   * answer, not when the node leaves: the closing transition keeps the buttons in the page for a
   * moment, and a key pressed during it must not reach them.
   */
  function settle(dialog: DialogRequest, ok: boolean) {
    console.debug('[Dialog] settle:', ok);
    dialog.resolve(ok);
    activeDialog.set(null);
    if (focusedBefore?.isConnected) focusedBefore.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
    focusedBefore = null;
  }

  /**
   * The keyboard inside the dialog. Escape dismisses (cancel for a confirm, acknowledge for an
   * alert). Tab stays among the dialog's buttons. Enter and Space are NOT read here: they
   * activate the button that holds the focus, so Enter on "Cancel" cancels.
   */
  function onKeydown(e: KeyboardEvent, dialog: DialogRequest) {
    if (e.key === 'Escape') {
      e.preventDefault();
      settle(dialog, false);
      return;
    }
    if (e.key !== 'Tab') return;
    const buttons = Array.from(
      (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button')
    );
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey
      ? at <= 0
        ? buttons.length - 1
        : at - 1
      : at === buttons.length - 1
        ? 0
        : at + 1;
    e.preventDefault();
    buttons[next].focus();
  }

  /**
   * Holds the focus while the dialog is open: on opening it goes to the button that changes
   * nothing - "Cancel" for a confirm, the only button for an alert. `settle` gives it back to
   * whatever held it before, so the keyboard resumes where the person was.
   */
  function holdFocus(node: HTMLElement) {
    focusedBefore = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>('button')?.focus();
  }
</script>

{#if $activeDialog}
  <!-- Keyed on the request: a dialog asked for while the previous one is still leaving the page
       is a NEW block, so `holdFocus` runs for it too. -->
  {#key $activeDialog}
    {@const dialog = $activeDialog}
    <div
      class="backdrop"
      transition:fade={{ duration: 150 }}
      onclick={(e) => e.target === e.currentTarget && settle(dialog, false)}
      onkeydown={(e) => onKeydown(e, dialog)}
      role="presentation"
    >
      <div
        class="dialog"
        transition:scale={{ duration: 180, start: 0.95 }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={dialog.title ? 'confirm-dialog-title' : undefined}
        aria-describedby="confirm-dialog-message"
        tabindex="-1"
        use:holdFocus
      >
        {#if dialog.title}
          <h2 id="confirm-dialog-title">{dialog.title}</h2>
        {/if}
        <p class="message" id="confirm-dialog-message">{dialog.message}</p>
        <div class="actions">
          {#if dialog.kind === 'confirm'}
            <button class="ghost" onclick={() => settle(dialog, false)}>
              {dialog.cancelLabel ?? m.common_cancel()}
            </button>
          {/if}
          <button class="primary" class:danger={dialog.danger} onclick={() => settle(dialog, true)}>
            {#if dialog.kind === 'confirm'}
              {dialog.confirmLabel ?? m.dialog_confirm()}
            {:else}
              {dialog.cancelLabel ?? m.dialog_ok()}
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/key}
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 5, 12, 0.7);
    backdrop-filter: blur(4px);
    z-index: 1300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .dialog {
    width: 100%;
    max-width: 420px;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 1.5rem;
    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.6);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
    color: #f8fafc;
  }
  .message {
    margin: 0 0 1.5rem;
    color: #cbd5e1;
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-line;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .primary {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 10px 18px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:hover {
    background: #2563eb;
  }
  .primary.danger {
    background: #dc2626;
  }
  .primary.danger:hover {
    background: #b91c1c;
  }
  .ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #cbd5e1;
    padding: 10px 18px;
    border-radius: 8px;
    cursor: pointer;
  }
  .ghost:hover {
    background: rgba(255, 255, 255, 0.05);
  }
</style>
