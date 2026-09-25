/**
 * What jsdom does not implement, declared once.
 *
 * jsdom is a partial DOM, and the parts it omits throw `TypeError: x is not a function` at the
 * first call rather than reporting anything about the environment. Filling them HERE, in one place
 * a reader can enumerate, is the difference between "this repository knows its test DOM is
 * incomplete" and every test file working around the same hole differently.
 *
 * Nothing in this file may emulate application behaviour. It provides browser primitives, and only
 * those the platform is missing.
 */

/**
 * `window.matchMedia` is absent from jsdom entirely.
 *
 * It became load-bearing when `vitest.config.ts` started resolving Svelte's browser build: before
 * that, `$app/environment`'s `browser` was `false` under test, so `themeStore`'s browser branch -
 * the one that reads the stored theme and falls back to the OS preference - was DEAD CODE in every
 * run. It executes now, which is the point, and it calls this.
 *
 * The default is `matches: false`, i.e. "the OS does not ask for dark mode". A test that cares must
 * say so itself rather than inherit an answer from here.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/**
 * `Element.prototype.animate` (Web Animations) is absent from jsdom.
 *
 * Svelte runs every `transition:` through it, so a component whose root carries a `|global`
 * transition (the person sheet) throws `element.animate is not a function` on mount. The stand-in
 * finishes at once - a test DOM has no frames to animate - and fires `onfinish` asynchronously, as
 * a real animation would, so Svelte's intro/outro bookkeeping completes.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function animate() {
    const animation = {
      onfinish: null as null | (() => void),
      cancel: () => {},
      finished: Promise.resolve(),
      currentTime: 0,
    };
    queueMicrotask(() => animation.onfinish?.());
    return animation as unknown as Animation;
  };
}
