# UI audit (2026-09-25) - the work list

Measured on production `sky.mitv.fr` on a **Mi 9T** (Chrome Android, 393 CSS px, DPR 2.75) and in
desktop Chrome at 1440x900, signed in. The bar is the one the user set for the whole ecosystem that
day: the reference app of each domain (for a zoomable graph, **Google Maps / Apple Maps**), Material 3
and Apple HIG for touch, WCAG 2.2 for accessibility. Source locations are from `main` on the same day.
**Delete each row the day it ships.** The sibling audits: MiGallery `docs/wiki/ui-redesign.md`, Canari
`docs/wiki/backlog.md`.

## P1 - the zoom cannot be controlled

Two-finger pinch measured with a real multi-touch gesture (uiautomator2): the fingers going from
300 px to 600 px apart (**2x**) took the graph from a ~50 px blob to more than 900 px across
(**~20x**). Two pinch-ins shrank the whole graph to a 50 px blob in empty space. Three causes, all read
in the source:

| Cause                                                                                                                                                                                                          | Where                                                                                                                     | Fix                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Zoom is ADDITIVE.** A pinch adds `(distance change in px) * 0.005` to the zoom, the wheel adds `-deltaY * 0.001`. The same gesture is x12 when zoomed out (0.05 -> 0.6) and x1.3 when zoomed in (2 -> 2.55). | `src/lib/components/Canvas/GraphCanvas.svelte:236-240` (wheel), `:373-381` (pinch); `src/lib/stores/cameraStore.ts:39-46` | **Multiplicative**: pinch `zoom *= dist / lastDist`, wheel `zoom *= Math.exp(-deltaY * k)`. Then a 2x spread is a 2x zoom at every level - the Maps contract. |
| **The zoom centre is thrown away.** `zoom(delta, _centerX, _centerY)` receives it and ignores it, so every zoom is on the screen centre, never between the fingers or under the cursor.                        | `cameraStore.ts:39`                                                                                                       | Keep the world point under the pinch midpoint / cursor fixed: adjust the camera target by the anchor's offset before and after the scale change.              |
| **The lower bound is 0.01** (100x out), so the graph can be lost.                                                                                                                                              | `cameraStore.ts:41`                                                                                                       | Lower bound = the zoom at which the whole graph fits the viewport; upper bound where a label is ~2x its base size.                                            |

Pinned by a unit test on `cameraStore`: a 2x pinch at any starting zoom yields 2x, and the anchor's
world point stays under the anchor.

## P2 - reading the map

| #   | Defect                                                                                                                                                                                                                                                                                         | Where                                                                                 | Change                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | **Labels overlap until unreadable** once the zoom passes 0.15 (e.g. "COLLAPTEAU Mathilde" over "ABDUL MASSIH Anna Theresa"): every node's name is drawn, with no collision test.                                                                                                               | `GraphCanvas.svelte:~224-230` (`fillText` for every person when `camera.zoom > 0.15`) | Label culling as a map does: selected, hovered and focus neighbours first, then any other label only if its box collides with none already placed.                        |
| 3   | **No map controls**: no zoom +/-, no "fit everything", no "take me to my star", no legend (what the dashed vs solid links and the yellow star mean). At overview zoom the map is blue dots with no names and no hint of what to do.                                                            | `GraphCanvas.svelte`, the page around it                                              | A small control stack (+, -, fit, me) in a corner, a collapsible legend, and a first-visit hint ("pince pour zoomer, touche une étoile").                                 |
| 4   | **The person sheet covers ~80% of the phone from the start**, with no drag handle and no half state, so the person cannot be seen IN the tree - which is Sky's point. The "Mode Focus" panel stays on top as well: with both, ~75% of the screen is covered and labels vanish under the panel. | the person sheet and the focus hub components                                         | A draggable bottom sheet: peek (~30%, name + promo + actions), half, full (associations). The focus hub shrinks to one row (depth chip + "Sortir") while a sheet is open. |
| 5   | **Mobile search** drops a list only as wide as the field, over the focus panel; a result whose name wraps is CENTRED while the others are left-aligned; the placeholder is cut ("Rechercher une étoile, une \|").                                                                              | the header search component                                                           | Full-screen search on a phone (as Maps / Photos), results left-aligned, a shorter placeholder ("Rechercher").                                                             |

## P3 - accessibility and polish

| #   | Defect                                                                                                                                                             | Change                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 6   | The CLOSED avatar menu (Mon profil, Mon arbre, Corriger ma liaison, Administration, langue, Déconnexion) is in the accessibility tree.                             | Render it only when open, or `inert` + `hidden`.                                                           |
| 7   | The graph is canvas-only: nothing in it reaches a screen reader (WCAG 1.1.1). Search compensates for finding a person, not for exploring.                          | A list/tree alternative of the focus neighbourhood beside the canvas (the sheet already holds half of it). |
| 8   | "Sortir" (leave focus) is red, a destructive colour for a neutral action.                                                                                          | Neutral text button.                                                                                       |
| 9   | Landing page: "Se connecter" is set in a different face (bold Roboto) from the rest (Space Grotesk). Desktop header: the search icon touches the placeholder text. | Same face; a gap between icon and text.                                                                    |

What already meets the bar: the landing page (one clear action, one sentence of context), the search
itself (fuzzy, finds "BOUTIN" for "boudin"), and the person sheet's CONTENT (associations with logo
and role).
