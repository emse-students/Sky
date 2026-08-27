import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // `tests/` is listed explicitly: it held a suite that had never once run, because the pattern
    // only ever looked under `src/`. A test file nobody executes is worse than no test file - it
    // reads as coverage on every review, and its assertions rot silently against the code.
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    globals: true,
    // `threads`, not vitest's default `forks`. Under the bun runtime the forks pool never
    // starts: every worker times out with `Failed to start forks worker` and the run reports
    // `no tests` while exiting non-zero, which reads like an empty suite rather than a broken
    // runner. Worker threads work, and the whole suite finishes in about two seconds.
    pool: 'threads',
    environment: 'jsdom',
  },
});
