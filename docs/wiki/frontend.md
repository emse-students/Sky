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
  The canvas repaints on every camera notification (#121), so `updateSmooth` writes nothing once
  settled: a store notifies on every `set` of an object, and a no-op write per frame meant a
  60 fps redraw of an idle map (pinned in `cameraStore.test.ts`).

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
  - **Labels are placed, not all drawn** (`src/lib/utils/labels.ts`, unit-tested in
    `labels.test.ts`), the way a map does it. Every on-screen star is a candidate with a
    screen-space box (names are drawn at a constant 12 px, so collisions are a screen question
    whatever the zoom) and a rank from `labelPriority`: selected > hovered > direct neighbour of
    the selected star > the rest, and within a tier the higher link DEGREE on the whole graph (a
    hub names its family). `placeLabels` walks the candidates in rank order (ties by id, so a
    scene always yields the same labels) and keeps one only if its box, padded by 3 px, overlaps
    none already kept - an occupancy grid of 64 px cells keeps it near-linear. Labels fade in and
    out over ~150 ms (`LabelFader`) instead of popping; while a fade is in flight the on-demand
    loop keeps drawing. There is no zoom threshold any more: at overview only the hubs are named.
    A dark 3 px outline (`strokeText`) keeps a name legible over links - a map halo, functional.
    Only a label actually drawn is a hit target. Until 2026-09 every name was drawn once the zoom
    passed 0.15, piling up into unreadable text in dense families.
  - **Map controls** (`MapControls.svelte`, tested in `MapControls.test.ts`): bottom-right, 48 px
    targets - zoom in, zoom out (x2 per press, `BUTTON_ZOOM_FACTOR`), fit (`fitView`: what is
    displayed, i.e. the focus neighbourhood in focus mode, fitted to 85% of the area the top bar
    and any bottom sheet leave uncovered), "my star" (when the user has one) and a collapsible
    legend (promo ramp, unknown promo, selected star, solid = parrainage, dashed = adoption).
    Buttons are not gestures: they call `setTarget` and EASE, and each press starts from the
    camera TARGET so quick presses compound. The focus hub moved to the top-right to leave that
    corner to the controls.
  - **First-visit hint**: "pinch / scroll to zoom, tap / click a star", until the first pointer
    down anywhere; remembered in `localStorage` (`sky.mapHintSeen`), shown again if storage is
    unavailable.
- **`StarfieldCanvas.svelte`** is the animated background.
- Avatars are `<img>` pointing at `/api/avatar/{id}`; on load error the UI falls
  back to initials (`getPersonInitials`). A per-id `imageErrors` flag tracks this.

## The home page (`+page.svelte`)

The map page owns the search box, the loading overlay (a random themed message
from `home_loading_*`), the focus hub and the profile panel.

- **The profile panel** is `ProfileSheet.svelte` (tested in `ProfileSheet.test.ts`): a left
  drawer below the top bar on desktop, and on a phone (<= 768 px) a bottom sheet after the Google
  Maps place sheet. It opens at a **peek** (30% of the height: avatar, name, promo, the two
  actions in a compact row) so the map stays usable above it, and snaps to **half** (60%) and
  **full** (88%, short of the 72 px bar, which stays above it). Dragging is on the handle only
  (`touch-action: none`), the release projected 180 ms along its velocity and snapped to the
  nearest state, or dismissed below 60% of the peek (`settleSheet` in `src/lib/utils/sheet.ts`,
  unit-tested). The handle is also a button: a tap or Enter toggles peek / full, ArrowUp /
  ArrowDown step. Escape closes the panel on every device; focus moves into it on open (a
  non-modal `role="dialog"` named by the person's name). It reports the pixels it covers
  (`covered`), which the map controls clear. Past half the screen the map controls AND the focus
  hub step aside (`sheetLeavesMapUsable`, one predicate for both): at full the hub used to show as
  a strip between the top bar and the sheet.
  Dismissing it on a phone keeps the star in focus; tapping that star again reopens it
  (`profileReopenRequests` in `graphStore.ts`, since re-setting the same selected id notifies
  nobody).
- The panel lists the person's **direct links** (godparents and godchildren, from `directLinks` in
  `graphStore.ts`, `id1 -> id2` = parrain -> fillot), each a button that selects that star: the
  accessible way to walk the graph the canvas draws. The canvas itself has a visually-hidden,
  `aria-live` one-sentence summary beside it (how many stars and links, or who is in focus).
- **The focus hub** sits top-right under the bar (the bottom-right corner is the map controls').
  While a sheet is open on a phone it shrinks to one row: a depth stepper (-, "3 sauts", +) and
  "Sortir", a neutral button - leaving focus is not destructive.
- **Search on a phone** opens its results full-screen below the bar, left-aligned, with the short
  placeholder "Rechercher"; Escape closes them without closing the sheet.
- **The account menu** is rendered only while open (click, or hover with a mouse; Escape and a
  click outside close it), so a closed menu is absent from the accessibility tree.
- The logo tiles (top bar, landing) are flat: a solid accent, no glow, no gradient. The search
  field keeps its focus ring - that is accessibility, not decoration.
- `app.css` makes form controls inherit the page face (buttons used to render in the system font).

Selecting a star loads its Canari profile
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
