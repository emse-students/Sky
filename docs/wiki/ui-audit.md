# UI audit (2026-09-25) - the work list

Measured on production `sky.mitv.fr` on a **Mi 9T** (Chrome Android, 393 CSS px, DPR 2.75) and in
desktop Chrome at 1440x900, signed in. The bar is the one the user set for the whole ecosystem that
day: the reference app of each domain (for a zoomable graph, **Google Maps / Apple Maps**), Material 3
and Apple HIG for touch, WCAG 2.2 for accessibility. Source locations are from `main` on the same day.
**Delete each row the day it ships.** The sibling audits: MiGallery `docs/wiki/ui-redesign.md`, Canari
`docs/wiki/backlog.md`.

## State: every row has shipped - what is owed is a reading on the phone

| Row                                                            | Shipped in | Mechanism                                                           |
| -------------------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| P1 - zoom additive, unanchored, unbounded                      | #118, #121 | [frontend.md - Zoom gestures](frontend.md#zoom-gestures)            |
| P2-2 labels overlap, P2-3 no map controls / legend / hint      | #120       | [frontend.md - Rendering](frontend.md#rendering)                    |
| P2-4 sheet covers 80%, P2-5 mobile search, P3-6 to P3-9 (a11y) | #122       | [frontend.md - The home page](frontend.md#the-home-page-pagesvelte) |

Every one of them was verified by unit / component tests and the gates, **none on the Mi 9T**. The
reading still owed there, in one pass:

- **Labels**: pinch through the whole range on a dense family - no two names ever overlap, names
  fade rather than pop, the selected star and its direct links are always named, a few hub names
  show at overview.
- **Controls**: +, -, fit and "my star" ease; fit in focus mode frames the neighbourhood below the
  bar and above the sheet; the stack sits above the peek and steps aside past half.
- **Sheet**: opens at ~30% with name, promo and the two actions visible without scrolling; the map
  pans and pinches above it; drag to half / full, a flick carries a state, a drag down from the peek
  dismisses; the focus hub is one row (depth stepper + "Sortir") while it is open.
- **Search**: the results fill the screen below the bar, left-aligned, the placeholder reads
  "Rechercher" whole.
- **Landing**: "Se connecter" is Space Grotesk like the rest.

## The home is my star (user decision, 2026-09-25)

The phone opened on the whole-sky overview: a field of 4 px dots with no name on a 393 px screen. A
signed-in member with a star now lands on it, selected and framed, its sheet at peek; the fit button
became "show the whole sky". Mechanism and fallbacks: [frontend.md - Rendering](frontend.md#rendering).
Owed on the Mi 9T: the landing shows no flight from the overview, and the dots read as crisp dots.

What already meets the bar: the landing page (one clear action, one sentence of context), the search
itself (fuzzy, finds "BOUTIN" for "boudin"), and the person sheet's CONTENT (associations with logo
and role).
