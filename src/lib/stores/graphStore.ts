import { writable, derived } from "svelte/store";
import type {
  Person,
  Relation,
  Position,
  GraphDataFile,
  JsonRelation,
} from "$types/graph";
import { hashString } from "$lib/utils/format";

export interface GraphData {
  people: Person[];
  relations: Relation[];
  positions: Record<string, Position>;
}

// Helper function to find neighbors within N hops using BFS
export function findNeighborsWithinHops(
  personId: string,
  relations: Relation[],
  maxHops: number,
): Set<string> {
  const neighbors = new Set<string>();
  neighbors.add(personId); // Include the person themselves

  const queue: Array<{ id: string; depth: number }> = [
    { id: personId, depth: 0 },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > maxHops) {
      continue;
    }
    visited.add(id);

    // Find all direct connections
    relations.forEach((rel) => {
      let neighborId: string | null = null;

      if (rel.id1 === id) {
        neighborId = rel.id2;
      } else if (rel.id2 === id) {
        neighborId = rel.id1;
      }

      if (neighborId && !visited.has(neighborId)) {
        neighbors.add(neighborId);
        if (depth < maxHops) {
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      }
    });
  }

  return neighbors;
}

/**
 * Return a positions map covering EVERY person: server positions are kept as-is,
 * and any person without one is placed deterministically on an outer ring
 * (angle + radius derived from a hash of the id). This guarantees the whole
 * roster is visible even when positions.json lags behind the graph.
 */
export function ensureAllPositioned(
  people: Person[],
  serverPositions: Record<string, Position>,
): Record<string, Position> {
  const positions: Record<string, Position> = { ...serverPositions };

  let maxRadius = 2000;
  for (const p of Object.values(serverPositions)) {
    const r = Math.hypot(p.x, p.y);
    if (r > maxRadius) {
      maxRadius = r;
    }
  }

  let missing = 0;
  for (const person of people) {
    if (!person.id || positions[person.id]) {
      continue;
    }
    const h = hashString(person.id);
    const angle = ((h % 3600) / 3600) * Math.PI * 2;
    const ring = maxRadius + 3000 + ((h >>> 12) % 6000);
    positions[person.id] = { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring };
    missing++;
  }

  if (missing > 0) {
    console.warn(
      `[Graph] ${missing} person(s) missing from positions.json, scattered as a fallback (run a positions recompute)`,
    );
  }
  return positions;
}

function createGraphStore() {
  const {
    subscribe,
    set,
    update: _update,
  } = writable<GraphData>({
    people: [],
    relations: [],
    positions: {},
  });

  let currentData: GraphData = { people: [], relations: [], positions: {} };

  subscribe((data) => {
    currentData = data;
  });

  return {
    subscribe,
    load: async () => {
      try {
        const timestamp = new Date().getTime();

        // Fetch graph structure
        const dataRes = await fetch(`/api/graph?t=${timestamp}`);
        const data = (await dataRes.json()) as GraphDataFile;

        // Fetch positions computed in-process by the server (see positions.ts)
        const posRes = await fetch(`/api/positions?t=${timestamp}`);
        let serverPositions: Record<string, Position> = {};
        if (posRes.ok) {
          serverPositions = (await posRes.json()) as Record<string, Position>;
        } else {
          console.warn(
            "Could not load positions.json, graph might look empty or clumped",
          );
        }

        // Convert people object to array if needed
        let peopleArray: Person[] = [];
        if (typeof data.people === "object" && data.people !== null) {
          peopleArray = Object.entries(data.people).map(([key, p]) => ({
            ...p,
            id: p.id || key,
          }));
        }

        // Convert relationships format (source/target -> id1/id2)
        let relationsArray: Relation[] = [];
        if (Array.isArray(data.relationships)) {
          relationsArray = data.relationships.map((rel: JsonRelation) => ({
            id1: rel.source,
            id2: rel.target,
            type: rel.type,
          }));
        }

        // Ensure every person is visible. Any node missing from the server
        // positions (added since the last layout recompute, or a recompute that
        // failed on the server) gets a deterministic scatter position on an
        // outer ring, so no family/star is ever silently hidden on the map.
        const positions = ensureAllPositioned(peopleArray, serverPositions);

        set({
          people: peopleArray,
          relations: relationsArray,
          positions,
        });
      } catch (error) {
        console.error("Failed to load graph data:", error);
      }
    },
    searchPeople: (query: string) => {
      if (!query.trim()) {
        return [];
      }
      const q = query.toLowerCase();
      return currentData.people
        .filter((p) => {
          const fullName = `${p.nom} ${p.prenom}`.toLowerCase();
          return fullName.includes(q) || p.id?.toLowerCase().includes(q);
        })
        .slice(0, 10);
    },
  };
}

export const graphStore = createGraphStore();

export const searchQuery = writable("");
export const selectedPersonId = writable<string | null>(null);
export const focusDepth = writable<number>(3); // Default to 3 hops

// Derived store that filters people and relations based on selection and focus depth
export const filteredGraph = derived(
  [graphStore, selectedPersonId, focusDepth],
  ([$graph, $selectedId, $depth]) => {
    // If no selection, show everything
    if (!$selectedId) {
      return $graph;
    }

    // Find neighbors within depth
    const visiblePeople = findNeighborsWithinHops(
      $selectedId,
      $graph.relations,
      $depth,
    );

    // Filter people and relations
    return {
      people: $graph.people.filter((p) => visiblePeople.has(p.id)),
      relations: $graph.relations.filter(
        (r) => visiblePeople.has(r.id1) && visiblePeople.has(r.id2),
      ),
      positions: $graph.positions,
    };
  },
);
