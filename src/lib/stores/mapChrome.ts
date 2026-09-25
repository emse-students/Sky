import { writable } from 'svelte/store';

/**
 * Immersive mode on a phone, after Google Sky Map: a tap on EMPTY sky hides every control over the
 * map (and a second tap brings them back), so the sky is edge to edge. A tap that selects a star
 * does not toggle it, and the person sheet stays whatever its value.
 */
export const chromeHidden = writable(false);
