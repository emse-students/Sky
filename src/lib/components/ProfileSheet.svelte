<!--
  @component
  The container of the person panel: a left drawer on desktop, and on a phone a bottom sheet in the
  manner of the Google Maps place sheet - it opens at a PEEK (~30%: name, promo, actions) that
  leaves the map usable above it, is dragged by its handle to HALF or FULL, and dragged down to
  dismiss. The handle is also a button (tap, or Arrow keys, to change state) and Escape closes the
  panel on every device. Snap logic is pure, in `$lib/utils/sheet.ts`.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { X } from '@lucide/svelte';
  import { m } from '$lib/paraglide/messages';
  import { settleSheet, sheetHeight, stepSheet, type SheetState } from '$lib/utils/sheet';

  interface Props {
    /** Phone layout: a draggable bottom sheet instead of the desktop drawer. */
    mobile: boolean;
    /** Close the panel (the close button, Escape, a drag down past the peek). */
    onClose: () => void;
    /** Id of the element naming the panel (the person's name). */
    labelledBy: string;
    /** Screen pixels the sheet covers at the bottom (0 on desktop), for chrome that must clear it. */
    covered?: number;
    children: Snippet;
  }

  let { mobile, onClose, labelledBy, covered = $bindable(0), children }: Props = $props();

  let innerHeight = $state(0);
  let sheetState = $state<SheetState>('peek');
  /** Height while a finger holds the handle; null at rest. */
  let dragHeight = $state<number | null>(null);
  let panel: HTMLElement | undefined = $state();

  let height = $derived(dragHeight ?? sheetHeight(sheetState, innerHeight));

  $effect(() => {
    covered = mobile ? height : 0;
  });

  // Move focus into the panel when it opens, so the keyboard and a screen reader land on the
  // person just selected rather than staying on the canvas behind.
  $effect(() => {
    panel?.focus({ preventScroll: true });
  });

  // Tracks one drag of the handle: where it began, and the last sample for the release velocity.
  let drag: {
    pointerId: number;
    startY: number;
    startHeight: number;
    lastY: number;
    lastT: number;
    velocity: number;
    moved: boolean;
  } | null = null;

  /** A drag shorter than this is a tap on the handle. */
  const TAP_SLOP = 6;

  function onHandleDown(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: height,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
    };
  }

  function onHandleMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (Math.abs(e.clientY - drag.startY) > TAP_SLOP) drag.moved = true;
    if (!drag.moved) return;
    const dt = e.timeStamp - drag.lastT;
    // Upward finger motion grows the sheet: velocity is positive when dragged up.
    if (dt > 0) drag.velocity = (drag.lastY - e.clientY) / dt;
    drag.lastY = e.clientY;
    drag.lastT = e.timeStamp;
    const max = sheetHeight('full', innerHeight);
    dragHeight = Math.max(0, Math.min(max, drag.startHeight + (drag.startY - e.clientY)));
  }

  function onHandleUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const { moved, velocity } = drag;
    drag = null;
    if (!moved) {
      // A tap toggles between the peek and the full sheet.
      sheetState = sheetState === 'peek' ? 'full' : 'peek';
      dragHeight = null;
      return;
    }
    const rest = settleSheet(height, velocity, innerHeight);
    console.debug('[ProfileSheet] released at', Math.round(height), 'px ->', rest);
    dragHeight = null;
    if (rest === 'dismissed') onClose();
    else sheetState = rest;
  }

  function onHandleKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp') sheetState = stepSheet(sheetState, 1);
    else if (e.key === 'ArrowDown') sheetState = stepSheet(sheetState, -1);
    else return;
    e.preventDefault();
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<svelte:window bind:innerHeight onkeydown={onWindowKey} />

<div
  bind:this={panel}
  class="profile-sheet"
  class:mobile
  class:dragging={dragHeight !== null}
  style:height={mobile ? `${height}px` : null}
  role="dialog"
  aria-modal="false"
  aria-labelledby={labelledBy}
  tabindex="-1"
  transition:fly|global={mobile
    ? { y: 300, duration: 300, easing: cubicOut }
    : { x: -400, duration: 400, easing: cubicOut }}
>
  <div class="sheet-top">
    {#if mobile}
      <button
        class="handle"
        aria-label={sheetState === 'peek' ? m.sheet_expand() : m.sheet_collapse()}
        aria-expanded={sheetState !== 'peek'}
        onpointerdown={onHandleDown}
        onpointermove={onHandleMove}
        onpointerup={onHandleUp}
        onpointercancel={onHandleUp}
        onkeydown={onHandleKey}
        onclick={(e) => {
          // Pointer taps are handled on pointerup; this is the keyboard's Enter / Space.
          if (e.detail === 0) sheetState = sheetState === 'peek' ? 'full' : 'peek';
        }}
      >
        <span class="grip" aria-hidden="true"></span>
      </button>
    {/if}
    <button class="close" onclick={onClose} aria-label={m.common_close()}>
      <X size={22} />
    </button>
  </div>

  <div class="sheet-scroll">
    {@render children()}
  </div>
</div>

<style>
  /* Below the top bar, so the search stays usable while a person is open. */
  .profile-sheet {
    position: fixed;
    top: var(--nav-height, 72px);
    left: 0;
    bottom: 0;
    width: 400px;
    background: #0f172a;
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 1100;
    display: flex;
    flex-direction: column;
    outline: none;
  }
  .profile-sheet.mobile {
    top: auto;
    width: 100%;
    border-right: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px 16px 0 0;
    transition: height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  /* The sheet follows the finger exactly while dragged; it only animates when it settles. */
  .profile-sheet.mobile.dragging {
    transition: none;
  }
  .sheet-top {
    position: relative;
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
  }
  .mobile .sheet-top {
    justify-content: center;
    height: 36px;
  }
  .handle {
    width: 100%;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: grab;
    /* The handle's vertical drag is the sheet's, never a page scroll or a map pan. */
    touch-action: none;
  }
  .grip {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.3);
  }
  .close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    z-index: 1;
  }
  .mobile .close {
    top: 0;
    right: 4px;
  }
  .handle:focus-visible,
  .close:focus-visible {
    outline: 2px solid #87cefa;
    outline-offset: -2px;
  }
  .sheet-scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    overscroll-behavior: contain;
  }
  .mobile .sheet-scroll {
    padding-bottom: env(safe-area-inset-bottom, 0);
  }
</style>
