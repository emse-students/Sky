<!--
  @component
  The map's controls, after Google Sky Map (measured on the Mi 9T, 2026-09-25): a column of round
  translucent 40 px discs at the right edge - zoom in, zoom out, whole sky, "my star", legend - and,
  on a phone, the search as the one FILLED disc at the bottom. Flat: no border, no shadow.
  A right-edge column rather than a bottom row: at 393 px a row of six discs at Sky Map's 52 dp
  pitch spans ~270 px (69% of the width) and would sit on the peek sheet, across the band where the
  framed neighbourhood is; the column costs 40 px (10%) at the edge the map uses least.

  Buttons are not gestures: their moves go through `cameraStore.setTarget` and EASE, where a pinch
  jumps. Each press starts from the camera's TARGET, so three quick presses compound to x8 instead
  of restarting from the frame in flight.
-->
<script lang="ts">
  import { Plus, Minus, Maximize, LocateFixed, Info, X, Search } from '@lucide/svelte';
  import { cameraStore } from '$stores/cameraStore';
  import { graphStore } from '$stores/graphStore';
  import { BUTTON_ZOOM_FACTOR, zoomAt, zoomBoundsFor } from '$lib/utils/camera';
  import { showWholeSky } from '$stores/mapActions';
  import { promoColor } from '$lib/utils/promoColor';
  import { m } from '$lib/paraglide/messages';

  interface Props {
    /** Show "go to my star" and run this on press; omitted when the user has no star. */
    onMe?: () => void;
    /** Screen pixels covered by the top bar, where a fitted graph must not go. */
    topInset?: number;
    /** Screen pixels covered at the bottom (an open sheet): the stack sits above them. */
    bottomInset?: number;
    /** Show the filled search disc at the bottom (phones, which have no top bar) and run this. */
    onSearch?: () => void;
  }

  let { onMe, topInset = 0, bottomInset = 0, onSearch }: Props = $props();

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

  /**
   * Show the whole sky (user decision, 2026-09-25: the map opens on one's own star, and this
   * button is the way out to everything). It leaves focus mode, so every star is drawn.
   */
  function fit() {
    showWholeSky({ top: topInset, bottom: 0 });
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
    {#if onSearch}
      <button
        class="search"
        onclick={onSearch}
        aria-label={m.home_search_label()}
        title={m.home_search_label()}
      >
        <Search size={20} />
      </button>
    {/if}
  </div>
</div>

<style>
  .map-controls {
    position: fixed;
    right: 12px;
    bottom: calc(12px + var(--bottom-inset, 0px) + env(safe-area-inset-bottom, 0px));
    z-index: 900;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    transition: bottom 0.2s ease;
  }
  /* Round translucent discs, no border, no shadow - Sky Map's controls. 40 px each, 8 px apart. */
  .stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stack button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.72);
    border: none;
    color: #f8fafc;
    cursor: pointer;
  }
  .stack button:hover {
    background: rgba(30, 41, 59, 0.85);
  }
  /* The one filled disc: the search, in the accent colour. */
  .stack button.search {
    background: #3b82f6;
  }
  .stack button:focus-visible,
  .legend-close:focus-visible {
    outline: 2px solid #87cefa;
    outline-offset: 2px;
  }
  .legend {
    width: 220px;
    padding: 12px 14px;
    background: rgba(15, 23, 42, 0.85);
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
