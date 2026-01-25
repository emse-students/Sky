<script lang="ts">
    import { onMount } from 'svelte';
    import { cameraStore } from '$stores/cameraStore';

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let stars: Array<{ x: number; y: number; size: number; opacity: number }> = [];
    let animationFrame: number;

    $: camera = $cameraStore;

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        resizeCanvas();
        generateStars();
        window.addEventListener('resize', () => {
            resizeCanvas();
            generateStars();
        });

        const animate = () => {
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

    function generateStars() {
        stars = [];
        const count = 200;
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.7 + 0.3
            });
        }
    }

    function draw() {
        if (!ctx) return;

        // Clear with dark gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#000814');
        gradient.addColorStop(1, '#001d3d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw stars with parallax
        stars.forEach(star => {
            ctx.globalAlpha = star.opacity;
            ctx.fillStyle = '#fff';
            
            // Parallax effect based on camera
            const parallaxX = star.x - camera.x * 0.05;
            const parallaxY = star.y - camera.y * 0.05;
            
            ctx.beginPath();
            ctx.arc(parallaxX, parallaxY, star.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = 1;
    }
</script>

<canvas bind:this={canvas} class="starfield"></canvas>

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
