import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  plugins: [
    // Paraglide must compile before SvelteKit so the generated runtime in
    // src/lib/paraglide is available to the app. Sky runs server-side
    // (adapter-node), so locale detection is server-driven: the cookie set by
    // the language switcher, then the browser's Accept-Language header, then the
    // base locale (fr). The paraglide server middleware in hooks.server.ts binds
    // the resolved locale to the request during SSR.
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      strategy: ["cookie", "preferredLanguage", "baseLocale"],
    }),
    sveltekit(),
  ],
});
