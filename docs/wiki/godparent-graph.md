# Godparent graph

The godparent graph is the one thing Sky owns. It is a directed graph over
`people`: an edge `source -> target` means `source` is the godparent of `target`
(parrain -> fillot). Each edge has a `type`, `'parrainage'` (official) or
`'adoption'`. All business rules live in `src/lib/server/database.ts`.

## Relation rules

`addParrainage(sourceId, targetId, kind)` is the single entry point for creating
a link. It enforces, in order, throwing a typed `RelationError` on the first
violation:

1. `INVALID_KIND` - `kind` is not `'parrainage'`/`'adoption'`.
2. `SELF` - a person cannot be their own godparent.
3. `NOT_FOUND` - both records must exist.
4. `DUPLICATE` - no existing edge (of any type) already links the two.
5. `MAX_FILLOT` - the godparent is under the per-type godchild cap.
6. `MAX_PARRAIN` - the godchild is under the per-type godparent cap.
7. `CYCLE` - adding the edge must not create a cycle.
8. `PROMO_UNKNOWN` - both promotions must be known (a `null` level blocks the link).
9. `PROMO_ORDER` - the godchild must be a strictly more recent promotion than the godparent.
10. `PROMO_GAP` - the two promotions are at most `MAX_PROMO_GAP` (3) years apart.

### The 1 / 1 / 3 / 2 caps

```
MAX_PARRAINS = { parrainage: 1, adoption: 1 }   // incoming (godparents of a person)
MAX_FILLOTS  = { parrainage: 3, adoption: 2 }   // outgoing (godchildren of a person)
```

So a person has at most one official godparent and one adoption godparent, and at
most three official godchildren and two adoption godchildren. Counts come from
`countIncoming` / `countOutgoing`, filtered by `type`.

### Cycle detection

`canReach(fromId, toId)` does a BFS following `source -> target` edges. Adding
`source -> target` would create a cycle iff `target` can already reach `source`,
so `addParrainage` rejects when `canReach(targetId, sourceId)` is true.

### Promotion rules

A godchild is always a strictly more recent promotion than their godparent, and
at most `MAX_PROMO_GAP` (3) years younger. `checkPromoPair(parrainLevel,
fillotLevel)` is the pure validator (returns the violated code or `null`); both
promotions must be known, so a `null` level blocks the link (`PROMO_UNKNOWN`).
The rule applies to both link kinds. `level` is the graduation year; comparing
it is equivalent to comparing entry years (both offset by 3).

Separately, promotions entered by users are range-checked at creation:
`isValidPromo(level)` accepts `null` (unknown) or an integer `>= MIN_PROMO`
(1816, the school's founding year). It guards the star-creation and edit
endpoints (`POST /api/relationships`, `PUT /api/relatives/[id]`, and the admin
people routes), which return `m.api_promo_invalid` with HTTP `400` on a typo.

### Error surfacing

`RelationError.message` is a localized Paraglide string (`m.rel_err_*()`),
rendered in the request locale thanks to the paraglide hook (see
[architecture.md](architecture.md)). The `POST /api/relationships` handler
returns it as `{ error, code }` with HTTP `409`, so the client can show the
message directly and branch on the machine `code`.

## Families

A "family" is a connected component of the godparent graph, treated as
undirected. `isSameFamily(aId, bId)` runs a BFS over both incoming and outgoing
edges and returns true when `b` is reachable from `a` (or they are the same id).

Families are the authorization unit for editing: a user may edit the entourage of
any node in their **own** family, not just their own node. Admins may edit
anyone.

## The entourage editor

The tree editor (`tree/` page + `AddRelativeModal.svelte`) is backed by these
endpoints:

- **`GET /api/entourage?id=`** - the direct entourage of a person: incoming
  `parrains` and outgoing `fillots`, plus `maxParrains`/`maxFillots` (to draw the
  right number of empty slots) and `canEdit` (admin, or same family). Defaults to
  the signed-in user.

- **`POST /api/relationships`** - add a link. The body carries `type`, `role`
  (`parrain`|`fillot`, whose end the other person is on), a `centerId` (defaults
  to self; must be self, same-family, or admin), and either an existing
  `targetId` or a `newPerson`. Creating a `newPerson` requires a promo and does a
  dedup pass (`findPeopleByName`): on a name collision it returns `409
needsConfirmation` with candidates, unless `confirmCreate` is set, in which case
  it calls `createPlaceholderPerson`. On success it recomputes positions in the
  background.

- **`DELETE /api/relationships`** - remove a link by `relationshipId`, allowed
  when either endpoint is in the user's family (or admin).

- **`PUT`/`DELETE /api/relatives/[id]`** - edit or delete a **placeholder**'s
  identity from the tree. `updatePlaceholderIdentity` is a no-op on a linked
  record: an account's identity is owned by MiConnect. Deleting a placeholder
  removes it and cascades its edges.

## Merge suggestions

Because placeholders and accounts are added independently, duplicates happen.
`getMergeSuggestions(limit)` proposes likely duplicate pairs for the admin
dashboard:

- Skips pairs where **both** sides are real accounts (not mergeable).
- Prunes on sorted-token name length, then on promo compatibility (equal, unknown
  on one side, or within 3 years - a data-entry slip plus the entry/graduation
  offset).
- Keeps pairs whose `nameDistance` (tolerant to typos and last/first inversion,
  see [matching-and-search.md](matching-and-search.md)) is within
  `NAME_MATCH_MAX_DISTANCE` (2).
- Excludes pairs the admin has ignored (`ignored_merge_pairs`).

Sorted by ascending distance. The admin can merge a pair (`mergePeople`, keeping
the graph, the linked record surviving) or ignore it (`ignoreMergePair`).

## Graph layout

Positions are computed in-process by `src/lib/server/positions.ts`
(`layoutGraph(nodeIds, edges)`), a pure, dependency-light, deterministic
function:

1. Each connected component of >= 2 people is laid out with **ForceAtlas2**
   (graphology) from a circular seed, recentered on its centroid, and rescaled so
   the average edge length equals `TARGET_EDGE_LENGTH` (180). Iterations scale
   with component size (200 / 400 / 600).
2. Components are packed as **non-overlapping circles**, biggest first, each
   placed at the spot closest to the origin that does not overlap
   (`packCircles`/`findSpot`), with a `COMPONENT_MARGIN` (220) gap.
3. Lone people (no link) are **scattered deterministically** on outer rings,
   angle and radius derived from a stable hash of their id (`scatterIsolated`),
   beyond `ISOLATED_GAP` (2500).

Determinism (hash-based scatter, fixed iteration counts) means repeated runs on
the same graph are stable.

`recalculatePositions()` (in `database.ts`) reads the graph, calls `layoutGraph`,
writes `database/positions.json`, and records a `PositionsStatus`
(`ok, at, positioned, total, error`) retrievable via `getPositionsStatus()`. It
rejects with a detailed error rather than failing silently, because the map only
shows positioned nodes. It is triggered:

- in the background after any graph edit (`POST /api/relationships`);
- when a new account record is created at login;
- on demand from the admin dashboard (`POST /api/admin/positions/recalc`).

The frontend additionally scatters any node still missing from `positions.json`,
so a lagging or failed recompute never hides a star (see
[frontend.md](frontend.md)).
