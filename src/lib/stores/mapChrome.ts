import { writable } from 'svelte/store';
import type { Insets } from '$lib/utils/camera';

/**
 * Immersive mode on a phone, after Google Sky Map: a tap on EMPTY sky hides every control over the
 * map (and a second tap brings them back), so the sky is edge to edge. A tap that selects a star
 * does not toggle it, and the person sheet stays whatever its value.
 */
export const chromeHidden = writable(false);

/**
 * The screen band a framed star is centred in: what the chrome leaves free around a selection - the
 * focus chip above, the peek sheet below (phone) or the person drawer on the left (desktop). Set by
 * the page, which owns that layout; read by `frameStar`, so the auto-zoom, "go to my star",
 * "centre the view" and the landing all frame for the same band.
 */
export const framingInsets = writable<Insets>({ top: 0, bottom: 0 });
