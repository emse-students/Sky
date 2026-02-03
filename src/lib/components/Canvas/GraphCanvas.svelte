<script lang="ts">
  import { onMount } from "svelte";
  import {
    filteredGraph,
    selectedPersonId,
    graphStore,
    findNeighborsWithinHops,
    focusDepth,
  } from "$stores/graphStore";
  import { cameraStore } from "$stores/cameraStore";
  import { getPersonName } from "$lib/utils/format";

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animationFrame: number;

  // State
  let isDragging = false;
  let hasDragged = false;
  let dragStart = { x: 0, y: 0 };
  let hoveredPerson: string | null = null;
  let lastHoverCheck = 0;
  const HOVER_THROTTLE = 50; // ms

  $: ({ people, relations, positions } = $filteredGraph);
  $: camera = $cameraStore;

  // Watch for selection changes and auto-zoom to focus area
  let lastSelectedId: string | null = null;
  $: if ($selectedPersonId && $selectedPersonId !== lastSelectedId) {
    lastSelectedId = $selectedPersonId;
    autoZoomToSelection($selectedPersonId);
  } else if (!$selectedPersonId && lastSelectedId) {
    lastSelectedId = null;
    // Reset zoom when deselecting
    cameraStore.setTarget(0, 0, 0.1);
  }

  function autoZoomToSelection(personId: string) {
    const fullGraph = $graphStore;
    if (!fullGraph.positions[personId]) return;

    // Calculate bounding box of the focus group (family/neighbors)
    const neighbors = findNeighborsWithinHops(
      personId,
      fullGraph.relations,
      $focusDepth,
    );

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    let count = 0;

    neighbors.forEach((id) => {
      const pos = fullGraph.positions[id];
      if (pos) {
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
        count++;
      }
    });

    // If single person or invalid bounds, center on person with default zoom
    if (count <= 1 || minX === Infinity) {
      const selectedPos = fullGraph.positions[personId];
      cameraStore.setTarget(selectedPos.x, selectedPos.y, 0.8);
      return;
    }

    // Calculate center of the group
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Zoom to fit with margin
    const width = maxX - minX;
    const height = maxY - minY;
    const margin = 1.5; // Good margin for context

    const cWidth = canvas ? canvas.width : window.innerWidth;
    const cHeight = canvas ? canvas.height : window.innerHeight;

    const zoomX = cWidth / (width * margin);
    const zoomY = cHeight / (height * margin);

    // Cap zoom (not too close for small groups, not too far for huge ones)
    let targetZoom = Math.min(zoomX, zoomY);
    targetZoom = Math.min(Math.max(targetZoom, 0.1), 1.0);

    cameraStore.setTarget(centerX, centerY, targetZoom);
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Load data
    graphStore.load();

    // Animation loop
    const animate = () => {
      cameraStore.updateSmooth();
      draw();
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrame);
    };
  });

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function draw() {
    if (!ctx) return;

    // Clear avec transparence pour voir le fond étoilé
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculer la zone visible (viewport culling)
    const viewLeft = camera.x - canvas.width / 2 / camera.zoom;
    const viewRight = camera.x + canvas.width / 2 / camera.zoom;
    const viewTop = camera.y - canvas.height / 2 / camera.zoom;
    const viewBottom = camera.y + canvas.height / 2 / camera.zoom;

    // Transform
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Draw relations (lines) - seulement si bien zoomé
    if (camera.zoom > 0.03) {
      ctx.lineWidth = 1 / camera.zoom;
      relations.forEach((rel) => {
        const pos1 = positions[rel.id1];
        const pos2 = positions[rel.id2];
        if (pos1 && pos2) {
          // Viewport culling pour les lignes aussi
          if (
            (pos1.x < viewLeft && pos2.x < viewLeft) ||
            (pos1.x > viewRight && pos2.x > viewRight) ||
            (pos1.y < viewTop && pos2.y < viewTop) ||
            (pos1.y > viewBottom && pos2.y > viewBottom)
          ) {
            return;
          }

          // Style différent selon le type de lien
          if (rel.type === "adoption") {
            // Adoption - ligne pointillée
            ctx.strokeStyle = "rgba(150, 100, 255, 0.4)";
            ctx.setLineDash([5 / camera.zoom, 5 / camera.zoom]);
          } else {
            // Parrainage (officiel) - ligne continue
            ctx.strokeStyle = "rgba(100, 150, 255, 0.3)";
            ctx.setLineDash([]);
          }

          ctx.beginPath();
          ctx.moveTo(pos1.x, pos1.y);
          ctx.lineTo(pos2.x, pos2.y);
          ctx.stroke();
        }
      });
      // Reset line dash
      ctx.setLineDash([]);
    }

    // Draw people (nodes) - viewport culling
    people.forEach((person) => {
      if (!person.id) return;
      const pos = positions[person.id];
      if (!pos) return;

      // Skip si hors écran
      if (
        pos.x < viewLeft ||
        pos.x > viewRight ||
        pos.y < viewTop ||
        pos.y > viewBottom
      ) {
        return;
      }

      const isHovered = hoveredPerson === person.id;
      const isSelected = $selectedPersonId === person.id;

      // Node circle
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4 / camera.zoom, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = "#fbbf24";
      } else if (isHovered) {
        ctx.fillStyle = "#60a5fa";
      } else {
        ctx.fillStyle = "#3b82f6";
      }
      ctx.fill();

      // Label - afficher tout le temps si zoomé
      if (camera.zoom > 0.15) {
        ctx.fillStyle = isSelected
          ? "#fbbf24"
          : isHovered
            ? "#fff"
            : "rgba(255, 255, 255, 0.7)";
        ctx.font = `${12 / camera.zoom}px "Space Grotesk", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(getPersonName(person), pos.x, pos.y - 10 / camera.zoom);
      }
    });

    ctx.restore();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    cameraStore.zoom(delta);
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

      if (
        Math.abs(e.clientX - dragStart.x) > 5 ||
        Math.abs(e.clientY - dragStart.y) > 5
      ) {
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

      hoveredPerson = found;
      canvas.style.cursor = found
        ? "pointer"
        : isDragging
          ? "grabbing"
          : "grab";
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleClick(e: MouseEvent) {
    if (hoveredPerson) {
      selectedPersonId.set(hoveredPerson);
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

  function findNodeAt(clientX: number, clientY: number): string | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const worldX = (mouseX - canvas.width / 2) / camera.zoom + camera.x;
    const worldY = (mouseY - canvas.height / 2) / camera.zoom + camera.y;
    const threshold = 40 / camera.zoom; // Increased hit radius for better click sensitivity

    for (const person of people) {
      if (!person.id) continue;
      const pos = positions[person.id];
      if (!pos) continue;

      const dist = Math.sqrt((pos.x - worldX) ** 2 + (pos.y - worldY) ** 2);
      let isHit = dist < threshold;

      if (!isHit && camera.zoom > 0.15 && ctx) {
        const name = getPersonName(person);
        const fontSize = 12 / camera.zoom;
        ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
        const textMetrics = ctx.measureText(name);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;
        const textY = pos.y - 10 / camera.zoom; // Baseline
        const textTop = textY - textHeight;
        const textLeft = pos.x - textWidth / 2;
        const textRight = pos.x + textWidth / 2;
        const padding = 2 / camera.zoom;

        if (
          worldX >= textLeft - padding &&
          worldX <= textRight + padding &&
          worldY >= textTop - padding &&
          worldY <= textY + padding
        ) {
          isHit = true;
        }
      }

      if (isHit) return person.id;
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
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (e.cancelable) e.preventDefault();

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const dx = (t.clientX - lastTouchX) / camera.zoom;
      const dy = (t.clientY - lastTouchY) / camera.zoom;

      if (
        Math.abs(t.clientX - dragStart.x) > 5 ||
        Math.abs(t.clientY - dragStart.y) > 5
      ) {
        isDragging = true;
        hasDragged = true;
      }

      if (isDragging) {
        cameraStore.pan(-dx, -dy);
      }
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.sqrt(
        Math.pow(t1.clientX - t2.clientX, 2) +
          Math.pow(t1.clientY - t2.clientY, 2),
      );
      const delta = (dist - lastTouchDistance) * 0.005;
      cameraStore.zoom(delta);
      lastTouchDistance = dist;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!hasDragged && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      const foundId = findNodeAt(t.clientX, t.clientY);
      if (foundId) {
        selectedPersonId.set(foundId);
      } else {
        selectedPersonId.set(null);
      }
    }
    if (e.touches.length === 0) {
      isDragging = false;
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
  on:touchend={handleTouchEnd}
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
