/**
 * In-process graph layout for the Sky star map, replacing the former Python
 * (networkx) script. Given the people ids and the parrainage edges, it produces
 * a { id: {x, y} } position map:
 *   1. each connected component (>= 2 people) is laid out with ForceAtlas2,
 *      recentered on its centroid and rescaled to a consistent edge length;
 *   2. the components are packed as non-overlapping circles, biggest first;
 *   3. lone people (no link) are scattered deterministically on outer rings.
 *
 * Pure and dependency-light (no DB, no filesystem): the caller reads the graph
 * and writes positions.json. Deterministic (hash-based scatter, fixed iteration
 * counts) so repeated runs on the same graph are stable.
 */

import Graph from "graphology";
import { connectedComponents } from "graphology-components";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { circular } from "graphology-layout";
import { hashString } from "$utils/format";

export interface Point {
  x: number;
  y: number;
}

/** Desired distance between two linked stars after normalization. */
const TARGET_EDGE_LENGTH = 180;
/** Extra radius kept around a component so packed circles do not touch. */
const COMPONENT_MARGIN = 220;
/** Ring gap beyond the connected cluster where lone stars are scattered. */
const ISOLATED_GAP = 2500;
/** Width of the scatter band for lone stars. */
const ISOLATED_SPREAD = 6000;

/** A single connected component laid out locally (centroid at origin) + its radius. */
interface LaidOutComponent {
  nodes: Record<string, Point>;
  radius: number;
}

/**
 * Compute a position for every node. `edges` are undirected pairs; unknown
 * endpoints and self-loops are ignored. Returns an empty map for an empty graph.
 */
export function layoutGraph(
  nodeIds: string[],
  edges: [string, string][],
): Record<string, Point> {
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const id of nodeIds) {
    if (!graph.hasNode(id)) {
      graph.addNode(id);
    }
  }
  for (const [a, b] of edges) {
    if (a === b || !graph.hasNode(a) || !graph.hasNode(b)) {
      continue;
    }
    if (!graph.hasEdge(a, b)) {
      graph.addUndirectedEdge(a, b);
    }
  }

  if (graph.order === 0) {
    return {};
  }

  const components = connectedComponents(graph);
  const connected = components.filter((c) => c.length >= 2);
  const isolated = components.filter((c) => c.length === 1).map((c) => c[0]);

  const laidOut = connected.map((comp) => layoutComponent(graph, comp));

  // Pack the component circles and offset each component's local positions.
  const centers = packCircles(laidOut.map((l) => l.radius));
  const positions: Record<string, Point> = {};
  let maxRadius = 0;
  laidOut.forEach((component, i) => {
    const center = centers[i];
    for (const [id, p] of Object.entries(component.nodes)) {
      const point = { x: p.x + center.x, y: p.y + center.y };
      positions[id] = point;
      maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.y));
    }
  });

  scatterIsolated(isolated, positions, maxRadius);
  return positions;
}

/**
 * Lay out one connected component: ForceAtlas2 from a circular seed, then
 * recenter on the centroid and rescale so the average edge length equals
 * TARGET_EDGE_LENGTH. Returns the local positions and the enclosing radius.
 */
function layoutComponent(graph: Graph, comp: string[]): LaidOutComponent {
  const sub = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  for (const n of comp) {
    sub.addNode(n);
  }
  for (const n of comp) {
    for (const nb of graph.neighbors(n)) {
      // `n < nb` dedupes the undirected pair; both endpoints are in this component.
      if (sub.hasNode(nb) && n < nb && !sub.hasEdge(n, nb)) {
        sub.addUndirectedEdge(n, nb);
      }
    }
  }

  circular.assign(sub, { scale: comp.length * 20 });
  const iterations = comp.length < 50 ? 200 : comp.length < 200 ? 400 : 600;
  forceAtlas2.assign(sub, {
    iterations,
    settings: forceAtlas2.inferSettings(sub),
  });

  const raw: Record<string, Point> = {};
  let cx = 0;
  let cy = 0;
  sub.forEachNode((n, attr) => {
    const p = { x: attr.x as number, y: attr.y as number };
    raw[n] = p;
    cx += p.x;
    cy += p.y;
  });
  const count = comp.length;
  cx /= count;
  cy /= count;

  // Average edge length in the raw layout drives the rescale factor.
  let edgeSum = 0;
  let edgeCount = 0;
  sub.forEachEdge((_e, _a, source, target) => {
    const s = raw[source];
    const t = raw[target];
    edgeSum += Math.hypot(s.x - t.x, s.y - t.y);
    edgeCount++;
  });
  const avgEdge = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const scale = avgEdge > 1e-6 ? TARGET_EDGE_LENGTH / avgEdge : 1;

  const nodes: Record<string, Point> = {};
  let radius = 0;
  for (const [id, p] of Object.entries(raw)) {
    const point = { x: (p.x - cx) * scale, y: (p.y - cy) * scale };
    nodes[id] = point;
    radius = Math.max(radius, Math.hypot(point.x, point.y));
  }
  return { nodes, radius: radius + COMPONENT_MARGIN };
}

/**
 * Greedy circle packing: place the biggest circle at the center, then each next
 * one at the position closest to the origin that does not overlap those already
 * placed. Returns a center for each input radius (input order preserved).
 */
function packCircles(radii: number[]): Point[] {
  const centers: Point[] = radii.map(() => ({ x: 0, y: 0 }));
  const order = radii.map((_, i) => i).sort((a, b) => radii[b] - radii[a]);
  const placed: { x: number; y: number; r: number }[] = [];

  for (const idx of order) {
    const r = radii[idx];
    const spot = placed.length === 0 ? { x: 0, y: 0 } : findSpot(r, placed);
    centers[idx] = spot;
    placed.push({ x: spot.x, y: spot.y, r });
  }
  return centers;
}

/** First non-overlapping spot for a circle of radius r, spiralling out from the origin. */
function findSpot(
  r: number,
  placed: { x: number; y: number; r: number }[],
): Point {
  const angleSteps = 24;
  const maxOuter = placed.reduce(
    (m, p) => Math.max(m, Math.hypot(p.x, p.y) + p.r),
    0,
  );
  const step = Math.max(r, 50);
  for (let ring = 0; ring <= maxOuter + r + step * 4; ring += step) {
    for (let a = 0; a < angleSteps; a++) {
      const theta = (a / angleSteps) * Math.PI * 2;
      const cand = { x: Math.cos(theta) * ring, y: Math.sin(theta) * ring };
      if (!overlapsAny(cand, r, placed)) {
        return cand;
      }
    }
  }
  // Fallback: push far out on the +x axis (should be unreachable in practice).
  return { x: maxOuter + r + step, y: 0 };
}

/** True if a circle (cand, r) overlaps any already-placed circle. */
function overlapsAny(
  cand: Point,
  r: number,
  placed: { x: number; y: number; r: number }[],
): boolean {
  for (const p of placed) {
    const minDist = r + p.r;
    const dx = cand.x - p.x;
    const dy = cand.y - p.y;
    if (dx * dx + dy * dy < minDist * minDist * 0.999) {
      return true;
    }
  }
  return false;
}

/**
 * Scatter lone people on deterministic rings outside the connected cluster, so
 * every star is visible without clumping at the origin.
 */
function scatterIsolated(
  ids: string[],
  positions: Record<string, Point>,
  maxRadius: number,
): void {
  const base = (maxRadius || 1000) + ISOLATED_GAP;
  for (const id of ids) {
    const h = hashString(id);
    const angle = ((h % 3600) / 3600) * Math.PI * 2;
    const ring = base + ((h >>> 12) % ISOLATED_SPREAD);
    positions[id] = { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
  }
}
