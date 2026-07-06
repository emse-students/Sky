import { writable } from "svelte/store";

/** Whether the dialog asks for a yes/no choice or is acknowledge-only. */
export type DialogKind = "confirm" | "alert";

/** Optional labels and styling for a dialog helper. */
export interface DialogOptions {
  /** Optional heading shown above the message. */
  title?: string;
  /** Label of the confirming button (confirm only). */
  confirmLabel?: string;
  /** Label of the cancel/dismiss button. */
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
}

/** A dialog request currently rendered by the global ConfirmDialog host. */
export interface DialogRequest extends DialogOptions {
  kind: DialogKind;
  message: string;
  /** Resolves the awaiting caller: true = confirmed, false = cancelled. */
  resolve: (ok: boolean) => void;
}

/** The dialog currently displayed, or null when none is open. */
export const activeDialog = writable<DialogRequest | null>(null);

/**
 * Show an in-app confirm modal and resolve to the user's choice. Drop-in
 * replacement for the native `confirm()` so every prompt stays inside the app
 * window instead of a browser dialog.
 */
export function confirmDialog(
  message: string,
  options: DialogOptions = {},
): Promise<boolean> {
  console.debug("[Dialog] confirm:", message);
  return new Promise((resolve) => {
    activeDialog.set({ kind: "confirm", message, ...options, resolve });
  });
}

/**
 * Show an in-app alert modal with a single acknowledge button. Drop-in
 * replacement for the native `alert()`; resolves once dismissed.
 */
export function alertDialog(
  message: string,
  options: DialogOptions = {},
): Promise<void> {
  console.debug("[Dialog] alert:", message);
  return new Promise((resolve) => {
    activeDialog.set({
      kind: "alert",
      message,
      ...options,
      resolve: () => resolve(),
    });
  });
}
