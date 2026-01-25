<script lang="ts">
    import { onMount } from 'svelte';
    import { graphStore, selectedPersonId } from '$stores/graphStore';
    import { cameraStore } from '$stores/cameraStore';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let animationFrame: number;

    // State
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let hoveredPerson: string | null = null;
    let lastHoverCheck = 0;
    const HOVER_THROTTLE = 50; // ms

    $: ({ people, relations, positions } = $graphStore);
    $: camera = $cameraStore;

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        
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
            window.removeEventListener('resize', resizeCanvas);
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
        const viewLeft = camera.x - (canvas.width / 2) / camera.zoom;
        const viewRight = camera.x + (canvas.width / 2) / camera.zoom;
        const viewTop = camera.y - (canvas.height / 2) / camera.zoom;
        const viewBottom = camera.y + (canvas.height / 2) / camera.zoom;

        // Transform
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw relations (lines) - seulement si bien zoomé
        if (camera.zoom > 0.03) {
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)';
            ctx.lineWidth = 1 / camera.zoom;
            relations.forEach(rel => {
                const pos1 = positions[rel.id1];
                const pos2 = positions[rel.id2];
                if (pos1 && pos2) {
                    // Viewport culling pour les lignes aussi
                    if ((pos1.x < viewLeft && pos2.x < viewLeft) || 
                        (pos1.x > viewRight && pos2.x > viewRight) ||
                        (pos1.y < viewTop && pos2.y < viewTop) ||
                        (pos1.y > viewBottom && pos2.y > viewBottom)) {
                        return;
                    }
                    ctx.beginPath();
                    ctx.moveTo(pos1.x, pos1.y);
                    ctx.lineTo(pos2.x, pos2.y);
                    ctx.stroke();
                }
            });
        }

        // Draw people (nodes) - viewport culling
        people.forEach(person => {
            if (!person.id) return;
            const pos = positions[person.id];
            if (!pos) return;

            // Skip si hors écran
            if (pos.x < viewLeft || pos.x > viewRight || pos.y < viewTop || pos.y > viewBottom) {
                return;
            }

            const isHovered = hoveredPerson === person.id;
            const isSelected = $selectedPersonId === person.id;

            // Node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 4 / camera.zoom, 0, Math.PI * 2);
            
            if (isSelected) {
                ctx.fillStyle = '#fbbf24';
            } else if (isHovered) {
                ctx.fillStyle = '#60a5fa';
            } else {
                ctx.fillStyle = '#3b82f6';
            }
            ctx.fill();

            // Label on hover/select
            if (isHovered || isSelected) {
                ctx.fillStyle = '#fff';
                ctx.font = `${12 / camera.zoom}px "Space Grotesk", sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(
                    person.name || '',
                    pos.x,
                    pos.y - 10 / camera.zoom
                );
            }
        });

        ctx.restore();
    }

    function handleWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = -e.deltaY * 0.001;
        cameraStore.zoom(delta);
    }

    function handleMouseDown(e: MouseEvent) {
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
    }

    function handleMouseMove(e: MouseEvent) {
        if (isDragging) {
            const dx = (e.clientX - dragStart.x) / camera.zoom;
            const dy = (e.clientY - dragStart.y) / camera.zoom;
            cameraStore.pan(-dx, -dy);
            dragStart = { x: e.clientX, y: e.clientY };
        } else {
            // Throttle hover check
            const now = Date.now();
            if (now - lastHoverCheck < HOVER_THROTTLE) return;
            lastHoverCheck = now;

            // Check hover
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const worldX = (mouseX - canvas.width / 2) / camera.zoom + camera.x;
            const worldY = (mouseY - canvas.height / 2) / camera.zoom + camera.y;

            let found: string | null = null;
            const threshold = 10 / camera.zoom;

            for (const person of people) {
                if (!person.id) continue;
                const pos = positions[person.id];
                if (!pos) continue;

                const dist = Math.sqrt((pos.x - worldX) ** 2 + (pos.y - worldY) ** 2);
                if (dist < threshold) {
                    found = person.id;
                    break;
                }
            }

            hoveredPerson = found;
            canvas.style.cursor = found ? 'pointer' : isDragging ? 'grabbing' : 'grab';
        }
    }

    function handleMouseUp() {
        isDragging = false;
    }

    function handleClick(e: MouseEvent) {
        if (hoveredPerson) {
            selectedPersonId.set(hoveredPerson);
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
    }
</style>
