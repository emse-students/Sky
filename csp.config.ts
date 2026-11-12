/**
 * The content security policy, read by `vite.config.ts` (SvelteKit's `csp` option, which adds a
 * hash for each inline script it writes) and by the tests.
 *
 * TWO STAGES. `directives` is ENFORCED now. `reportOnly` is OBSERVED for one release: nothing in
 * it blocks anything, and every violation a browser sees is posted to `CSP_REPORT_PATH` and logged
 * (`noteCspReport`). Once the log of a release is quiet, its entries move to `directives`.
 */

/** Where a browser posts what the report-only policy would have blocked. */
export const CSP_REPORT_PATH = '/api/csp-report';

export const CSP = {
  mode: 'auto',
  directives: {
    // No other site may display this one in a frame (the modern form of X-Frame-Options).
    'frame-ancestors': ['self'],
  },
  reportOnly: {
    'default-src': ['self'],
    'script-src': ['self'],
    // Svelte writes `style` attributes (transitions, computed positions): inline styles stay.
    'style-src': ['self', 'unsafe-inline'],
    // `data:` and `blob:` are the cropped avatar previews; the generated-initials avatar is the
    // one picture fetched from another site.
    'img-src': ['self', 'data:', 'blob:', 'https://ui-avatars.com'],
    'font-src': ['self', 'data:'],
    'connect-src': ['self'],
    'object-src': ['none'],
    'base-uri': ['self'],
    'form-action': ['self'],
    'report-uri': [CSP_REPORT_PATH],
  },
} as const;
