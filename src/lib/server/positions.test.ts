/**
 * THE GATE THAT LETS THE GRAPH LAYOUT DEPENDENCIES BE UPGRADED WITHOUT A HUMAN.
 *
 * `layoutGraph` is the only thing in this repository that uses `graphology`,
 * `graphology-components`, `graphology-layout` and `graphology-layout-forceatlas2`, and until this
 * file existed nothing tested it at all. That matters more than an ordinary coverage gap, because
 * of what those four break like: a layout library does not stop compiling when it changes, it
 * returns DIFFERENT NUMBERS. `bun run check`, `bun run lint` and `bun run build` would all stay
 * green while the star map silently rearranged itself for every student.
 *
 * So the frozen expectations below are the point of the file, not an implementation detail. They
 * were produced by the versions in `bun.lock` on 2026-08-31 and they are a TRIPWIRE: if a
 * dependency bump reddens this file, the layout genuinely moved and somebody has to look at the map
 * before blessing the new numbers. That is a slow answer, but it is an answer - the alternative is
 * finding out from a student.
 *
 * The module documents itself as pure and deterministic (hash-based scatter, fixed iteration
 * counts). Both halves are asserted here rather than trusted: purity by running it twice, and
 * determinism by the frozen values.
 */

import { describe, it, expect } from 'vitest';
import { layoutGraph, type Point } from '$server/positions';

/**
 * One connected component of six and two lone stars, which is the smallest graph that exercises
 * all three phases: ForceAtlas2 on a component, the circle packing that places components, and the
 * deterministic scatter that puts unlinked people on outer rings.
 */
const NODE_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'lone-1', 'lone-2'];
const EDGES: [string, string][] = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'a'],
  ['c', 'd'],
  ['d', 'e'],
  ['e', 'f'],
];

/** The connected six. The other two are placed by `scatterIsolated`, not by ForceAtlas2. */
const LINKED = ['a', 'b', 'c', 'd', 'e', 'f'];
const ISOLATED = ['lone-1', 'lone-2'];

/**
 * Rounding to whole units is deliberate. It keeps the assertion sensitive to a layout that MOVED -
 * the stars sit hundreds of units apart, so a real change is orders of magnitude larger than this -
 * while leaving no room for a last-bit floating point difference between two machines to fail a
 * build for a map nobody would see differ.
 */
function rounded(positions: Record<string, Point>): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const [id, p] of Object.entries(positions)) {
    out[id] = [Math.round(p.x), Math.round(p.y)];
  }
  return out;
}

describe('layoutGraph', () => {
  it('places every node it was given, and nothing else', () => {
    const positions = layoutGraph(NODE_IDS, EDGES);

    expect(Object.keys(positions).sort()).toEqual([...NODE_IDS].sort());
    for (const id of NODE_IDS) {
      expect(Number.isFinite(positions[id].x), `${id}.x is finite`).toBe(true);
      expect(Number.isFinite(positions[id].y), `${id}.y is finite`).toBe(true);
    }
  });

  it('is pure: two runs on the same graph return the same map', () => {
    // Purity is what lets `recalculatePositions` be re-run at any time without the map jumping.
    // A dependency that introduced a random seed would still compile, still typecheck, and break
    // exactly this.
    expect(layoutGraph(NODE_IDS, EDGES)).toEqual(layoutGraph(NODE_IDS, EDGES));
  });

  it('draws the same SHAPE whatever order the graph arrives in, but not the same coordinates', () => {
    // Measured 2026-08-31, and it is why `recalculatePositions` now orders both of its queries.
    // ForceAtlas2 seeds from insertion order, so a reordered graph comes back ROTATED: every
    // distance preserved to a fraction of a percent, every coordinate different. Nothing is
    // corrupted by that - but it means the absolute positions are a function of the ROW ORDER, and
    // a bare `SELECT` in SQLite has none guaranteed. `scripts/rebuild-db.js` renumbers rowids, so
    // without `ORDER BY` the whole map turns on a rebuild and every student's star moves.
    //
    // This asserts the invariant that genuinely holds. The stability students actually see is
    // bought in the caller, not here.
    const positions = layoutGraph(NODE_IDS, EDGES);
    const reversed = layoutGraph(
      [...NODE_IDS].reverse(),
      [...EDGES].reverse().map(([x, y]) => [y, x] as [string, string])
    );

    const distance = (p: Record<string, Point>, a: string, b: string) =>
      Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y);

    for (const [from, to] of EDGES) {
      const a = distance(positions, from, to);
      const b = distance(reversed, from, to);
      // 2% covers the handful of ForceAtlas2 iterations that land differently; a layout that
      // actually changed would miss this by an order of magnitude.
      expect(Math.abs(a - b) / a, `${from}-${to} kept its length`).toBeLessThan(0.02);
    }
  });

  it('keeps lone stars well outside the connected cluster', () => {
    const positions = layoutGraph(NODE_IDS, EDGES);

    const clusterRadius = Math.max(
      ...LINKED.map((id) => Math.hypot(positions[id].x, positions[id].y))
    );
    for (const id of ISOLATED) {
      // ISOLATED_GAP is 2500 in the module. Asserting "further out than the cluster, by a lot"
      // rather than the constant itself keeps this a statement about the RESULT, which is what a
      // reader of the map would notice, instead of a restatement of a line of the source.
      expect(Math.hypot(positions[id].x, positions[id].y)).toBeGreaterThan(clusterRadius + 2000);
    }
  });

  it('separates linked stars by a usable distance', () => {
    const positions = layoutGraph(NODE_IDS, EDGES);

    for (const [from, to] of EDGES) {
      const d = Math.hypot(
        positions[from].x - positions[to].x,
        positions[from].y - positions[to].y
      );
      // TARGET_EDGE_LENGTH is 180 and the rescale is applied per component, so no linked pair may
      // collapse onto a single point or fly off. A ForceAtlas2 whose scaling changed lands here.
      expect(d, `${from}-${to} distance`).toBeGreaterThan(20);
      expect(d, `${from}-${to} distance`).toBeLessThan(4000);
    }
  });

  it('still produces the map the pinned layout versions produced', () => {
    // THE VERSION TRIPWIRE. Regenerate these ONLY after looking at the resulting map, and say in
    // the commit message what moved and why it is acceptable.
    expect(rounded(layoutGraph(NODE_IDS, EDGES))).toEqual(FROZEN);
  });
});

/** Produced by the versions in `bun.lock` on 2026-08-31. See the test above before changing it. */
const FROZEN: Record<string, [number, number]> = {
  a: [313, 118],
  b: [332, -9],
  c: [154, 29],
  d: [-88, -10],
  e: [-289, -48],
  f: [-423, -80],
  'lone-1': [6735, 2438],
  'lone-2': [-5257, -165],
};
