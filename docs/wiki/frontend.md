# Frontend

The frontend is a Svelte 5 app rendering the star map on an HTML canvas, with a
few supporting pages (tree editor, account, admin). This page covers the data
flow, rendering, and i18n.

## Stores

Svelte stores in `src/lib/stores/`:

- **`graphStore`** (`graphStore.ts`) - the loaded graph
  (`{ people, relations, positions }`). `graphStore.load()` fetches
  `/api/graph` and `/api/positions` in parallel (cache-busted with a timestamp),
  converts the wire shapes (`source/target` -> `id1/id2`, people object ->
  array), and calls `ensureAllPositioned` so every person has a position.
- **`selectedPersonId`**, **`focusDepth`** (default 3) - drive focus mode.
- **`filteredGraph`** - a derived store: with no selection it is the whole graph;
  with a selection it is the sub-graph within `focusDepth` hops
  (`findNeighborsWithinHops`, BFS over undirected relations).
- **`cameraStore`** (`cameraStore.ts`) - pan/zoom with smooth interpolation
  toward a target (`targetX/targetY/targetZoom`), plus `calculateMaxPan`.
  Programmatic moves (`setTarget`, e.g. the auto-zoom on selection) ease toward
  the target; zoom GESTURES call `jumpTo`, which sets current and target at once
  (direct manipulation - an easing view cannot keep the anchor under the fingers).

### Zoom gestures

Wheel, trackpad pinch (a wheel event with `ctrlKey`) and two-finger pinch all go
through ONE pure function, `zoomAt` in `src/lib/utils/camera.ts` (unit-tested in
`camera.test.ts`), the contract of Google Maps / Figma / d3-zoom:

- **Multiplicative.** A pinch step scales by `distance / lastDistance`, a wheel
  event by `wheelZoomFactor` - d3-zoom's constants: `2^(-deltaY * 0.002)` in
  pixels (one 100 px notch = x1.15), `0.05` per line (Firefox), and x10 with
  `ctrlKey` so a trackpad pinch tracks the fingers. A 2x spread is 2x at every
  level. (Until 2026-09 the step was ADDITIVE: a 2x spread measured ~x20 on a
  Mi 9T when zoomed out, x1.3 when zoomed in.)
- **Anchored.** The world point under the cursor / pinch midpoint stays under
  it; during a pinch it also follows the midpoint, so one call is scale + pan.
- **Bounded by the graph.** `zoomBoundsFor` sets the minimum at
  `MIN_ZOOM_FIT_RATIO` (0.5) of the zoom at which every positioned star fits
  the viewport, the maximum at `MAX_ZOOM` (5; nodes and labels are drawn at a
  constant screen size, so closer only means emptier). A view a programmatic
  move left outside the range is never pushed further out and never snapped.
- **`themeStore`** (`themeStore.ts`) - light/dark theme, persisted; has a test.

### Never hide a star

`ensureAllPositioned(people, serverPositions)` keeps server positions as-is and
places any person missing from `positions.json` on a deterministic outer ring
(angle + radius from `hashString(id)`). This guarantees the whole roster is
visible even when `positions.json` lags the graph (a node added since the last
recompute, or a recompute that failed server-side). It logs a warning suggesting
a positions recompute. The scatter mirrors the server's `scatterIsolated`.

## Rendering

- **`GraphCanvas.svelte`** draws the graph on a 2D canvas: clears, applies the
  camera transform, groups relations, and skips off-screen nodes (viewport
  culling) before drawing stars and labels. It renders `filteredGraph`, so focus
  mode naturally narrows what is drawn.
  - Nodes are tinted by promo (a person's `level`, their entry year): darker =
    older, lighter = more recent. The scale (`promoColor` in
    `src/lib/utils/promoColor.ts`) is normalised against the min/max promo of the
    currently displayed nodes, so the full ramp is used whatever the span;
    unknown promos get a neutral tint. Selected (amber) and hovered (light blue)
    nodes keep their highlight color.
- **`StarfieldCanvas.svelte`** is the animated background.
- Avatars are `<img>` pointing at `/api/avatar/{id}`; on load error the UI falls
  back to initials (`getPersonInitials`). A per-id `imageErrors` flag tracks this.

## The home page (`+page.svelte`)

The map page owns the search box, the loading overlay (a random themed message
from `home_loading_*`), and the profile panel. The profile panel is a **left
drawer on desktop and a bottom sheet on mobile** (breakpoint 768px), sliding in
from the matching edge. Selecting a star loads its Canari profile
(`GET /api/canari/{id}`, see [integrations.md](integrations.md)) to show bio and
clubs; a "View on Canari" link points at `<canariUrl>/profile/<sub>` (the
`canariUrl` comes from `+layout.server.ts`).

Search uses `personMatchScore` (see
[matching-and-search.md](matching-and-search.md)) for tolerant, inversion-aware
ranking.

## Internationalization

Sky uses **Paraglide** (inlang). Messages are authored in `messages/fr.json` and
`messages/en.json` and compiled to `src/lib/paraglide/` by
`paraglide-js compile` (run as part of `bun run check`). Components import
`{ m } from "$lib/paraglide/messages"` and call `m.key()` or `m.key({ param })`.

- No user-facing string is inline; everything routes through `m.*()`.
- The locale is resolved server-side by the paraglide hook and reflected in
  `<html lang>`, so SSR output and server-thrown messages (API errors,
  `RelationError`) are already in the right language.
- `LocaleSwitcher.svelte` lets the user switch FR/EN.

When adding UI: add the key to both `fr.json` and `en.json`, keep text ASCII
(straight quotes/apostrophes, hyphens; ellipsis `…` allowed), and never leave a
French literal in code. Changing a component that carries a translated string
usually means updating its message keys in the same change.
