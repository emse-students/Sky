import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    // Paraglide must compile before SvelteKit so the generated runtime in
    // src/lib/paraglide is available to the app. Sky runs server-side
    // (adapter-bun), so locale detection is server-driven: the cookie set by
    // the language switcher, then the browser's Accept-Language header, then the
    // base locale (fr). The paraglide server middleware in hooks.server.ts binds
    // the resolved locale to the request during SSR.
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
    }),
    // Tailwind v4 runs as a Vite plugin: there is no PostCSS chain in this
    // repo any more, and no `tailwind.config.js` - the theme lives in the
    // `@theme` block of `src/app.css`.
    tailwindcss(),
    // SvelteKit 3 reads its configuration here: `svelte.config.js` is no longer supported.
    sveltekit({
      preprocess: vitePreprocess({ script: true }),
      // The official Bun adapter: Sky runs on Bun (`bun:sqlite`), so the server is Bun's own.
      adapter: adapter(),
    }),
  ],
});
