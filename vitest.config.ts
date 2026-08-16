import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // `tests/` is listed explicitly: it held a suite that had never once run, because the pattern
    // only ever looked under `src/`. A test file nobody executes is worse than no test file - it
    // reads as coverage on every review, and its assertions rot silently against the code.
    include: ["src/**/*.{test,spec}.{js,ts}", "tests/**/*.{test,spec}.{js,ts}"],
    globals: true,
    environment: "jsdom",
  },
});
