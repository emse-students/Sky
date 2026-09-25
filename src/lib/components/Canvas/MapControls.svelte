<!--
  @component
  The map's control stack, bottom-right as on Google Maps: zoom in, zoom out, fit, "my star", and a
  collapsible legend of what the colours and lines encode. Every button is a 48 px touch target.

  Buttons are not gestures: their moves go through `cameraStore.setTarget` and EASE, where a pinch
  jumps. Each press starts from the camera's TARGET, so three quick presses compound to x8 instead
  of restarting from the frame in flight.
-->
<script lang="ts">
  import { Plus, Minus, Maximize, LocateFixed, Info, X } from '@lucide/svelte';
  import { cameraStore } from '$stores/cameraStore';
  import { filteredGraph, graphStore } from '$stores/graphStore';
  import { BUTTON_ZOOM_FACTOR, fitView, zoomAt, zoomBoundsFor } from '$lib/utils/camera';
  import { promoColor } from '$lib/utils/promoColor';
  import { m } from '$lib/paraglide/messages';

  interface Props {
    /** Show "go to my star" and run this on press; omitted when the user has no star. */
    onMe?: () => void;
    /** Screen pixels covered by the top bar, where a fitted graph must not go. */
    topInset?: number;
    /** Screen pixels covered at the bottom (an open sheet): the stack sits above them. */
    bottomInset?: number;
  }

  let { onMe, topInset = 0, bottomInset = 0 }: Props = $props();

  let legendOpen = $state(false);

  // The ramp's two ends, from the same function that tints the stars.
  const olderColor = promoColor(0, { min: 0, max: 1 });
  const recentColor = promoColor(1, { min: 0, max: 1 });
  const unknownColor = promoColor(null, null);

  function viewport() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function zoomBy(factor: number) {
    const cam = $cameraStore;
    const vp = viewport();
    const target = zoomAt(
      { x: cam.targetX, y: cam.targetY, zoom: cam.targetZoom },
      factor,
      { x: vp.width / 2, y: vp.height / 2 },
      vp,
      zoomBoundsFor($graphStore.positions, vp)
    );
    console.debug('[MapControls] zoom x', factor, '->', target.zoom.toFixed(3));
    cameraStore.setTarget(target.x, target.y, target.zoom);
  }

  /** Fit what is displayed: the focus neighbourhood in focus mode, else the whole map. */
  function fit() {
    const { people, positions } = $filteredGraph;
    const points = people.map((p) => positions[p.id]).filter((pos) => pos !== undefined);
    const view = fitView(points, viewport(), { top: topInset, bottom: bottomInset });
    if (!view) {
      console.debug('[MapControls] fit: nothing positioned yet');
      return;
    }
    console.debug('[MapControls] fit', points.length, 'stars at zoom', view.zoom.toFixed(3));
    cameraStore.setTarget(view.x, view.y, view.zoom);
  }
</script>

<div class="map-controls" style:--bottom-inset="{bottomInset}px">
  {#if legendOpen}
    <div class="legend" id="map-legend">
      <div class="legend-head">
        <span>{m.map_legend()}</span>
        <button
          class="legend-close"
          onclick={() => (legendOpen = false)}
          aria-label={m.common_close()}
        >
          <X size={16} />
        </button>
      </div>
      <p class="legend-title">{m.map_legend_promo()}</p>
      <div
        class="ramp"
        style:background="linear-gradient(to right, {olderColor}, {recentColor})"
        aria-hidden="true"
      ></div>
      <div class="ramp-ends">
        <span>{m.map_legend_older()}</span>
        <span>{m.map_legend_recent()}</span>
      </div>
      <ul>
        <li><span class="dot" style:background={unknownColor}></span>{m.map_legend_unknown()}</li>
        <li><span class="dot selected"></span>{m.map_legend_selected()}</li>
        <li><span class="line solid"></span>{m.map_legend_parrainage()}</li>
        <li><span class="line dashed"></span>{m.map_legend_adoption()}</li>
      </ul>
    </div>
  {/if}

  <div class="stack" role="toolbar" aria-label={m.map_controls_label()} aria-orientation="vertical">
    <button
      onclick={() => zoomBy(BUTTON_ZOOM_FACTOR)}
      aria-label={m.map_zoom_in()}
      title={m.map_zoom_in()}
    >
      <Plus size={20} />
    </button>
    <button
      onclick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)}
      aria-label={m.map_zoom_out()}
      title={m.map_zoom_out()}
    >
      <Minus size={20} />
    </button>
    <button onclick={fit} aria-label={m.map_fit()} title={m.map_fit()}>
      <Maximize size={20} />
    </button>
    {#if onMe}
      <button onclick={onMe} aria-label={m.map_me()} title={m.map_me()}>
        <LocateFixed size={20} />
      </button>
    {/if}
    <button
      onclick={() => (legendOpen = !legendOpen)}
      aria-label={m.map_legend()}
      title={m.map_legend()}
      aria-expanded={legendOpen}
      aria-controls="map-legend"
    >
      <Info size={20} />
    </button>
  </div>
</div>

<style>
  .map-controls {
    position: fixed;
    right: 16px;
    bottom: calc(16px + var(--bottom-inset, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: 900;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    transition: bottom 0.2s ease;
  }
  .stack {
    display: flex;
    flex-direction: column;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    overflow: hidden;
  }
  .stack button {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #f8fafc;
    cursor: pointer;
  }
  .stack button + button {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .stack button:hover {
    background: rgba(255, 255, 255, 0.06);
  }
  .stack button:focus-visible,
  .legend-close:focus-visible {
    outline: 2px solid #87cefa;
    outline-offset: -2px;
  }
  .legend {
    width: 220px;
    padding: 12px 14px;
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    color: #f8fafc;
    font-size: 13px;
  }
  .legend-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .legend-close {
    width: 32px;
    height: 32px;
    margin: -8px -8px -8px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }
  .legend-title {
    color: #94a3b8;
    margin-bottom: 6px;
  }
  .ramp {
    height: 8px;
    border-radius: 4px;
  }
  .ramp-ends {
    display: flex;
    justify-content: space-between;
    color: #94a3b8;
    font-size: 12px;
    margin: 4px 0 10px;
  }
  .legend ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .dot.selected {
    background: #fbbf24;
  }
  .line {
    width: 24px;
    flex-shrink: 0;
    border-top: 2px solid rgba(100, 150, 255, 0.8);
  }
  .line.dashed {
    border-top: 2px dashed rgba(150, 100, 255, 0.9);
  }
</style>
