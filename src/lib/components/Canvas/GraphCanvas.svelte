<script lang="ts">
  import { onMount } from 'svelte';
  import {
    filteredGraph,
    selectedPersonId,
    graphStore,
    directLinks,
    selectStar,
  } from '$stores/graphStore';
  import { cameraStore } from '$stores/cameraStore';
  import { frameStar } from '$stores/mapActions';
  import { chromeHidden } from '$stores/mapChrome';
  import { getPersonName } from '$lib/utils/format';
  import { computePromoBounds, promoColor } from '$lib/utils/promoColor';
  import { wheelZoomFactor, zoomAt, zoomBoundsFor, type ScreenPoint } from '$lib/utils/camera';
  import {
    LabelFader,
    labelPriority,
    linkDegree,
    placeLabels,
    TextWidthCache,
    type LabelCandidate,
  } from '$lib/utils/labels';
  import type { Person } from '$types/graph';
  import type { DirectLinks } from '$stores/graphStore';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animationFrame: number;

  // On-demand rendering: only redraw when the camera moves or a visible state
  // changes (dirty), so nothing is computed while the scene is stable.
  let dirty = true;
  function requestRedraw() {
    dirty = true;
  }

  // State
  let isDragging = false;
  let hasDragged = false;
  let dragStart = { x: 0, y: 0 };
  let hoveredPerson: string | null = null;
  let lastHoverCheck = 0;
  const HOVER_THROTTLE = 50; // ms

  $: ({ people, relations, positions } = $filteredGraph);
  $: camera = $cameraStore;

  // Every camera change repaints. The animation loop alone only sees an EASED move: a zoom
  // gesture sets position and target together (`jumpTo`), so `updateSmooth` reports nothing
  // and the new view stayed undrawn until the next pan - a pinch appeared to do nothing.
  $: {
    void camera;
    requestRedraw();
  }

  // Promo -> node color bounds, recomputed only when the visible people change.
  // A person's `level` holds their promo (entry year); see promoMatches().
  $: promoBounds = computePromoBounds(people.map((p) => p.level));

  // Label ranking inputs. Degree is read on the WHOLE graph so a star's importance does not change
  // when focus mode hides part of its family; the neighbours are the selected star's direct links.
  $: degree = linkDegree($graphStore.relations);
  $: selectedNeighbours = neighbourIds(directLinks($selectedPersonId, $graphStore.relations));

  function neighbourIds(links: DirectLinks): Set<string> {
    return new Set([...links.parrains.map((r) => r.id1), ...links.fillots.map((r) => r.id2)]);
  }

  /**
   * On-screen radius of a star, in CSS px, at EVERY zoom (divided by the zoom inside the world
   * transform). Measured on the rig's layout at 393 px (2026-09-25): at the overview zoom the median
   * gap between a star and its nearest neighbour is 3.5 px (p25 2.5, p75 6.5), so a larger dot only
   * merges more of the overview into blobs, and a smaller one stops reading as a target. The
   * "dust" seen on the Mi 9T was the 1x backing store upscaled 2.75x, fixed by drawing at the
   * device pixel ratio, not by the radius.
   */
  const STAR_RADIUS = 4;

  /** Screen font of a star's name: constant whatever the zoom, like a map label. */
  const LABEL_FONT = '12px "Space Grotesk", sans-serif';
  /** Gap between a star and the baseline of its name, in screen pixels. */
  const LABEL_OFFSET = 10;
  /** Label box above / around the baseline, sized for the 12 px font with its descenders. */
  const LABEL_ASCENT = 12;
  const LABEL_HEIGHT = 16;

  // Labels drawn on the last frame (for hit-testing), their fade state, and the name widths.
  let placedLabels: LabelCandidate[] = [];
  const fader = new LabelFader();
  const widths = new TextWidthCache((name) => ctx.measureText(name).width);

  // Any change to the visible data triggers a redraw.
  $: {
    void people;
    void relations;
    void positions;
    requestRedraw();
  }

  // Watch for selection changes and auto-zoom to focus area
  let lastSelectedId: string | null = null;
  $: if ($selectedPersonId && $selectedPersonId !== lastSelectedId) {
    lastSelectedId = $selectedPersonId;
    requestRedraw();
    // Frame the new selection's neighbourhood - the one framing "go to my star" and the landing
    // share. The landing has already put the camera there, so this eases nowhere.
    frameStar($selectedPersonId);
  } else if (!$selectedPersonId && lastSelectedId) {
    lastSelectedId = null;
    // Deselecting does not move the camera: the caller that wants a view says which one ("Sortir"
    // and the fit button show the whole sky), and a click on empty space leaves the map where it is.
    requestRedraw();
  }

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load data
    graphStore.load();

    // Names measured before Space Grotesk arrived were measured in the fallback face: once the
    // font is ready, re-measure so label boxes (and so collisions) match what is drawn.
    document.fonts?.ready.then(() => {
      widths.clear();
      requestRedraw();
    });

    // Animation loop : ne dessine que si la camera bouge ou si un etat a change.
    const animate = () => {
      const moved = cameraStore.updateSmooth();
      if (moved || dirty) {
        // A label fade in flight asks for the next frame even when nothing else moves.
        dirty = draw();
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrame);
    };
  });

  // CSS size of the canvas (the full window): every position, hit test and camera computation is in
  // these units. The backing store is `devicePixelRatio` times larger so stars and names are drawn
  // at the screen's real resolution - at 1x a Mi 9T (DPR 2.75) upscaled every dot into a blur.
  let viewW = 0;
  let viewH = 0;
  let dpr = 1;
  /** Backing-store ceiling: past 3x the extra pixels cost memory and fill rate for nothing visible. */
  const MAX_DPR = 3;

  function resizeCanvas() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    requestRedraw();
  }

  /** Draw one frame. Returns true when another frame is needed (a label is still fading). */
  function draw(): boolean {
    if (!ctx) return false;

    // Clear with transparency so the starfield background shows through.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);

    // Compute the visible area (viewport culling).
    const viewLeft = camera.x - viewW / 2 / camera.zoom;
    const viewRight = camera.x + viewW / 2 / camera.zoom;
    const viewTop = camera.y - viewH / 2 / camera.zoom;
    const viewBottom = camera.y + viewH / 2 / camera.zoom;

    // Transform
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw relations (lines) - only when zoomed in enough. Lines are grouped by
    // type (official solid, adoption dashed) into a single path/stroke per style:
    // canvas state changes (strokeStyle/setLineDash) are costly, so we do only
    // two for the whole graph instead of two per link.
    if (camera.zoom > 0.03) {
      ctx.lineWidth = 1 / camera.zoom;
      const dash = 5 / camera.zoom;
      for (const adoption of [false, true]) {
        ctx.strokeStyle = adoption ? 'rgba(150, 100, 255, 0.4)' : 'rgba(100, 150, 255, 0.3)';
        ctx.setLineDash(adoption ? [dash, dash] : []);
        ctx.beginPath();
        for (const rel of relations) {
          if ((rel.type === 'adoption') !== adoption) continue;
          const pos1 = positions[rel.id1];
          const pos2 = positions[rel.id2];
          if (!pos1 || !pos2) continue;
          // Viewport culling: skip links entirely off-screen.
          if (
            (pos1.x < viewLeft && pos2.x < viewLeft) ||
            (pos1.x > viewRight && pos2.x > viewRight) ||
            (pos1.y < viewTop && pos2.y < viewTop) ||
            (pos1.y > viewBottom && pos2.y > viewBottom)
          ) {
            continue;
          }
          ctx.moveTo(pos1.x, pos1.y);
          ctx.lineTo(pos2.x, pos2.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw people (nodes) - viewport culling. The on-screen ones are then candidates for a label.
    const visible: Person[] = [];
    people.forEach((person) => {
      if (!person.id) return;
      const pos = positions[person.id];
      if (!pos) return;

      // Skip if off-screen
      if (pos.x < viewLeft || pos.x > viewRight || pos.y < viewTop || pos.y > viewBottom) {
        return;
      }

      const isHovered = hoveredPerson === person.id;
      const isSelected = $selectedPersonId === person.id;

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, STAR_RADIUS / camera.zoom, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = '#fbbf24';
      } else if (isHovered) {
        ctx.fillStyle = '#60a5fa';
      } else {
        // Tint by promo: darker = older, lighter = more recent.
        ctx.fillStyle = promoColor(person.level, promoBounds);
      }
      ctx.fill();

      visible.push(person);
    });

    ctx.restore();

    return drawLabels(visible);
  }

  /**
   * Name the visible stars the way a map does: rank every candidate label, draw one only where it
   * collides with none already placed (`placeLabels`), and fade labels in and out as they win or
   * lose their place rather than popping. Drawn in SCREEN space at a constant size.
   *
   * Returns true while a fade is in flight, so the on-demand loop draws another frame.
   */
  function drawLabels(visible: Person[]): boolean {
    const halfW = viewW / 2;
    const halfH = viewH / 2;
    ctx.font = LABEL_FONT;
    const candidates: LabelCandidate[] = [];
    const anchors: Record<string, { x: number; y: number; name: string }> = {};

    for (const person of visible) {
      const pos = positions[person.id];
      const name = getPersonName(person);
      const width = widths.get(name);
      const x = (pos.x - camera.x) * camera.zoom + halfW;
      const baseline = (pos.y - camera.y) * camera.zoom + halfH - LABEL_OFFSET;
      anchors[person.id] = { x, y: baseline, name };
      candidates.push({
        id: person.id,
        left: x - width / 2,
        top: baseline - LABEL_ASCENT,
        width,
        height: LABEL_HEIGHT,
        priority: labelPriority({
          selected: $selectedPersonId === person.id,
          hovered: hoveredPerson === person.id,
          neighbourOfSelected: selectedNeighbours.has(person.id),
          degree: degree.get(person.id) ?? 0,
        }),
      });
    }

    const placed = placeLabels(candidates);
    const animating = fader.step(placed);
    placedLabels = candidates.filter((c) => placed.has(c.id));

    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(5, 7, 10, 0.85)';
    for (const [id, alpha] of fader.opacity) {
      const anchor = anchors[id];
      // A fading label whose star left the screen has nothing to be drawn at.
      if (!anchor) continue;
      ctx.globalAlpha = alpha;
      // A dark outline keeps a name legible where it crosses a link or another star - the halo
      // every map draws around its labels, not a decoration.
      ctx.strokeText(anchor.name, anchor.x, anchor.y);
      ctx.fillStyle =
        $selectedPersonId === id
          ? '#fbbf24'
          : hoveredPerson === id
            ? '#fff'
            : 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(anchor.name, anchor.x, anchor.y);
    }
    ctx.globalAlpha = 1;
    return animating;
  }

  /** Canvas-relative position of a client (viewport) point. */
  function toCanvasPoint(clientX: number, clientY: number): ScreenPoint {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * Zoom by `factor` around `anchor`, carrying it to `moveTo` - the single path shared by the
   * wheel, a trackpad pinch and a two-finger pinch. Bounds come from the WHOLE graph (not the
   * focus sub-graph), so zooming out always reaches the full map.
   */
  function zoomGesture(factor: number, anchor: ScreenPoint, moveTo: ScreenPoint = anchor) {
    const viewport = { width: viewW, height: viewH };
    const bounds = zoomBoundsFor($graphStore.positions, viewport);
    cameraStore.jumpTo(zoomAt(camera, factor, anchor, viewport, bounds, moveTo));
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    zoomGesture(
      wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey),
      toCanvasPoint(e.clientX, e.clientY)
    );
  }

  // --- MOUSE HANDLING ---

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    hasDragged = false;
    dragStart = { x: e.clientX, y: e.clientY };
  }

  function handleMouseMove(e: MouseEvent) {
    if (isDragging) {
      const dx = (e.clientX - dragStart.x) / camera.zoom;
      const dy = (e.clientY - dragStart.y) / camera.zoom;

      if (Math.abs(e.clientX - dragStart.x) > 5 || Math.abs(e.clientY - dragStart.y) > 5) {
        hasDragged = true;
      }

      cameraStore.pan(-dx, -dy);
      dragStart = { x: e.clientX, y: e.clientY };
    } else {
      // Throttle hover check
      const now = Date.now();
      if (now - lastHoverCheck < HOVER_THROTTLE) return;
      lastHoverCheck = now;

      const found = findNodeAt(e.clientX, e.clientY);

      if (found !== hoveredPerson) {
        hoveredPerson = found;
        requestRedraw();
      }
      canvas.style.cursor = found ? 'pointer' : isDragging ? 'grabbing' : 'grab';
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleClick(e: MouseEvent) {
    if (hoveredPerson) {
      selectStar(hoveredPerson);
      e.stopPropagation(); // Stop propagation to avoid firing any other events
    } else if (!hasDragged) {
      // Clicked on background without dragging - reset view
      selectedPersonId.set(null);
    }
    // If hasDragged is true, do nothing (was panning the camera)
  }

  // --- TOUCH HANDLING ---

  let lastTouchX = 0;
  let lastTouchY = 0;
  let lastTouchDistance = 0;
  let lastTouchMid: ScreenPoint = { x: 0, y: 0 };

  /** Finger spread and midpoint (canvas pixels) of a two-finger touch. */
  function pinchGeometry(t1: Touch, t2: Touch): { distance: number; mid: ScreenPoint } {
    return {
      distance: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
      mid: toCanvasPoint((t1.clientX + t2.clientX) / 2, (t1.clientY + t2.clientY) / 2),
    };
  }

  function findNodeAt(clientX: number, clientY: number): string | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const worldX = (mouseX - viewW / 2) / camera.zoom + camera.x;
    const worldY = (mouseY - viewH / 2) / camera.zoom + camera.y;
    const threshold = 40 / camera.zoom; // Increased hit radius for better click sensitivity

    // A drawn name is part of its star's target. Only labels actually on screen count: a name the
    // placement hid must not capture a tap meant for the star beneath it.
    for (const label of placedLabels) {
      if (
        mouseX >= label.left &&
        mouseX <= label.left + label.width &&
        mouseY >= label.top &&
        mouseY <= label.top + label.height
      ) {
        return label.id;
      }
    }

    for (const person of people) {
      if (!person.id) continue;
      const pos = positions[person.id];
      if (!pos) continue;

      if (Math.hypot(pos.x - worldX, pos.y - worldY) < threshold) return person.id;
    }
    return null;
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      isDragging = false;
      hasDragged = false;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      dragStart = { x: lastTouchX, y: lastTouchY };
    } else if (e.touches.length === 2) {
      isDragging = true;
      hasDragged = true;
      const { distance, mid } = pinchGeometry(e.touches[0], e.touches[1]);
      lastTouchDistance = distance;
      lastTouchMid = mid;
      console.debug('[GraphCanvas] pinch start: spread', Math.round(distance), 'px');
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = (t.clientX - lastTouchX) / camera.zoom;
      const dy = (t.clientY - lastTouchY) / camera.zoom;

      if (Math.abs(t.clientX - dragStart.x) > 5 || Math.abs(t.clientY - dragStart.y) > 5) {
        isDragging = true;
        hasDragged = true;
      }

      if (isDragging) {
        cameraStore.pan(-dx, -dy);
      }
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    } else if (e.touches.length === 2) {
      const { distance, mid } = pinchGeometry(e.touches[0], e.touches[1]);
      // Two fingers on the same pixel give no ratio; wait for them to separate.
      if (lastTouchDistance > 0 && distance > 0) {
        zoomGesture(distance / lastTouchDistance, lastTouchMid, mid);
      }
      lastTouchDistance = distance;
      lastTouchMid = mid;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!hasDragged && e.changedTouches.length > 0) {
      // The touch path owns the tap: cancel the compatibility mouse events the browser would
      // synthesise after it, whose `click` on empty space would otherwise DESELECT (handleClick).
      if (e.cancelable) e.preventDefault();
      const t = e.changedTouches[0];
      const foundId = findNodeAt(t.clientX, t.clientY);
      // Only a direct hit changes the selection. A tap on empty space does NOT
      // exit focus: on touch, imprecise taps next to a star would otherwise drop
      // it. Focus is left via the explicit "Exit" button in the focus hub.
      if (foundId) {
        selectStar(foundId);
      } else {
        // A tap on empty sky toggles the controls over the map (immersive, as Sky Map does).
        chromeHidden.update((hidden) => !hidden);
      }
    }
    if (e.touches.length === 0) {
      isDragging = false;
    } else if (e.touches.length === 1) {
      // Pinch -> one finger: pan from where the remaining finger IS, not from where it was when
      // the pinch began, or the first one-finger move jumps the map by the whole pinch travel.
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    }
  }
</script>

<canvas
  bind:this={canvas}
  on:wheel={handleWheel}
  on:mousedown={handleMouseDown}
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
  on:mouseleave={handleMouseUp}
  on:click={handleClick}
  on:touchstart|nonpassive={handleTouchStart}
  on:touchmove|nonpassive={handleTouchMove}
  on:touchend|nonpassive={handleTouchEnd}
  id="graph"
  class="block"
></canvas>

<style>
  canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    background: transparent;
    touch-action: none;
  }
</style>
