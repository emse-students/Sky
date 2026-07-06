<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { activeDialog, type DialogRequest } from "$lib/stores/dialogStore";
  import { m } from "$lib/paraglide/messages";

  /**
   * Global host for in-app confirm/alert modals. Rendered once at the app root;
   * it displays whatever `confirmDialog()` / `alertDialog()` pushed to the store
   * and resolves the awaiting caller on the user's choice. Replaces the native
   * browser `confirm()` / `alert()` windows.
   */

  /** Resolve the active dialog with the given outcome and close it. */
  function settle(dialog: DialogRequest, ok: boolean) {
    console.debug("[Dialog] settle:", ok);
    dialog.resolve(ok);
    activeDialog.set(null);
  }

  function onKeydown(e: KeyboardEvent, dialog: DialogRequest) {
    if (e.key === "Escape") {
      e.preventDefault();
      // Escape dismisses: cancel for a confirm, acknowledge for an alert.
      settle(dialog, false);
    } else if (e.key === "Enter") {
      e.preventDefault();
      settle(dialog, true);
    }
  }
</script>

{#if $activeDialog}
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
      tabindex="-1"
    >
      {#if dialog.title}
        <h2>{dialog.title}</h2>
      {/if}
      <p class="message">{dialog.message}</p>
      <div class="actions">
        {#if dialog.kind === "confirm"}
          <button class="ghost" onclick={() => settle(dialog, false)}>
            {dialog.cancelLabel ?? m.common_cancel()}
          </button>
        {/if}
        <button
          class="primary"
          class:danger={dialog.danger}
          onclick={() => settle(dialog, true)}
        >
          {#if dialog.kind === "confirm"}
            {dialog.confirmLabel ?? m.dialog_confirm()}
          {:else}
            {dialog.cancelLabel ?? m.dialog_ok()}
          {/if}
        </button>
      </div>
    </div>
  </div>
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
