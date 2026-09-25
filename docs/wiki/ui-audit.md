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
  dismisses; the focus chip (depth, -, +, x) sits at the top.
- **Search**: the results fill the screen below the bar, left-aligned, the placeholder reads
  "Rechercher" whole.
- **Landing**: "Se connecter" is Space Grotesk like the rest.

## The home is my star (user decision, 2026-09-25)

The phone opened on the whole-sky overview: a field of 4 px dots with no name on a 393 px screen. A
signed-in member with a star now lands on it, selected and framed, its sheet at peek; the fit button
became "show the whole sky". Mechanism and fallbacks: [frontend.md - Rendering](frontend.md#rendering).
Owed on the Mi 9T: the landing shows no flight from the overview, and the dots read as crisp dots.

## The phone chrome follows Google Sky Map (user decision, 2026-09-25)

The user asked for Sky Map's look and called the focus panel "enorme". Sky Map was measured on the Mi
9T (density 396: 2.475 px per dp, DPR 2.75, so **1 dp = 0.9 CSS px**); Sky's numbers below are the
CSS sizes of what shipped, read from the stylesheet at a 393 px viewport - **not yet measured on the
phone**.

| Element          | Sky Map (Mi 9T)                                                                   | Sky before                                 | Sky now (393 px)                                                                    |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Top bar          | none, sky edge to edge                                                            | 72 px, full width                          | none on a phone; account = 40 px translucent disc, top-right, 8 px in               |
| Search           | round button in the bottom action row, the only filled one (accent)               | field in the top bar                       | 40 px accent disc at the bottom of the control column; opens the full-screen search |
| Action buttons   | 40 dp (36 px) discs, centres 52 dp (47 px) apart, translucent, no border / shadow | boxed square stack, 48 px cells, border    | 40 px (44 dp) discs, centres 48 px (53 dp) apart, translucent, no border / shadow   |
| Where            | bottom-right row of 5 (and a left layer rail)                                     | bottom-right stack                         | right-edge column of 6 (+, -, whole sky, my star, legend, search): 40 x 280 px      |
| Focus / readout  | readout card 85 x 92 dp (77 x 83 px), 12 sp                                       | card 280 x ~130 px (full width on a phone) | chip 40 px high, ~212 px wide, centred at the top: target, "3 sauts", -, +, x       |
| Tap on empty sky | hides / shows every control                                                       | nothing (and a synthetic click deselected) | hides / shows every control (phone); a star tap never toggles; the sheet stays      |

Why a column and not the bottom row: six discs at Sky Map's 52 dp pitch span ~270 px (69% of 393 px)
and would sit on the peek sheet, across the band where the framed neighbourhood is drawn; the column
costs 40 px (10% of the width) at the edge the map uses least. Desktop keeps its top bar: a wide
screen has room for a real search field, the keyboard path starts there, and nothing there is dust.
Not copied: Sky Map's "Trouve : X" chip after a search - in Sky the found person's sheet is that
chip. Owed on the Mi 9T: the numbers above as rendered, and the toggle on a real tap.

What already meets the bar: the landing page (one clear action, one sentence of context), the search
itself (fuzzy, finds "BOUTIN" for "boudin"), and the person sheet's CONTENT (associations with logo
and role).
