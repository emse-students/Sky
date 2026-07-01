<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { cameraStore } from "$stores/cameraStore";

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let stars: Array<{ x: number; y: number; size: number; opacity: number }> =
    [];
  let gradient: CanvasGradient | null = null;

  // On-demand rendering: the background only moves via camera parallax, so we
  // redraw ONLY when the camera position actually changes (or after a resize),
  // instead of a permanent 60fps loop. This keeps weak PCs/phones idle when the
  // view is still, which is the main source of wasted CPU/GPU/battery here.
  let camera = get(cameraStore);
  let lastCamX = Number.NaN;
  let lastCamY = Number.NaN;
  let scheduled = false;

  function scheduleDraw() {
    if (scheduled || !ctx) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      draw();
    });
  }

  // Redraw only when the camera x/y moved (parallax ignores zoom).
  const unsubscribe = cameraStore.subscribe((c) => {
    camera = c;
    if (ctx && (c.x !== lastCamX || c.y !== lastCamY)) {
      lastCamX = c.x;
      lastCamY = c.y;
      scheduleDraw();
    }
  });

  onMount(() => {
    ctx = canvas.getContext("2d")!;
    resize();
    window.addEventListener("resize", resize);
    scheduleDraw(); // initial paint

    return () => {
      window.removeEventListener("resize", resize);
      unsubscribe();
    };
  });

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    buildGradient();
    generateStars();
    scheduleDraw();
  }

  /** Cache the background gradient; only rebuilt on resize, not every frame. */
  function buildGradient() {
    gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#000814");
    gradient.addColorStop(1, "#001d3d");
  }

  /**
   * Adaptive star count: density scaled by viewport area and capped, so small or
   * low-power screens draw far fewer stars. Halved when the user asks for reduced
   * motion.
   */
  function starCount(): number {
    const area = canvas.width * canvas.height;
    let count = Math.min(200, Math.round(area / 12000));
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      count = Math.round(count / 2);
    }
    return Math.max(40, count);
  }

  function generateStars() {
    if (!canvas) return;
    stars = [];
    const count = starCount();
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.7 + 0.3,
      });
    }
  }

  function draw() {
    if (!ctx || !gradient) {
      return;
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // All stars are white: set fillStyle once, only vary alpha per star.
    ctx.fillStyle = "#fff";
    const w = canvas.width;
    const h = canvas.height;
    for (const star of stars) {
      ctx.globalAlpha = star.opacity;
      // Parallax + modulo wrap for an infinite background.
      let px = (star.x - camera.x * 0.05) % w;
      let py = (star.y - camera.y * 0.05) % h;
      if (px < 0) {
        px += w;
      }
      if (py < 0) {
        py += h;
      }
      ctx.beginPath();
      ctx.arc(px, py, star.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
</script>

<canvas bind:this={canvas} id="starfield" class="starfield"></canvas>

<style>
  .starfield {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }
</style>
