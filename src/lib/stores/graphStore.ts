import { writable } from 'svelte/store';
import type { Person, Relation, Position } from '$types/graph';

export interface GraphData {
    people: Person[];
    relations: Relation[];
    positions: Record<string, Position>;
}

function createGraphStore() {
	const { subscribe, set, update: _update } = writable<GraphData>({
		people: [],
		relations: [],
		positions: {}
	});

	let currentData: GraphData = { people: [], relations: [], positions: {} };

	subscribe(data => {
		currentData = data;
	});

	return {
		subscribe,
		load: async () => {
			try {
				const [dataRes, posRes] = await Promise.all([
					fetch('/data/data.json'),
					fetch('/data/positions.json')
				]);

				const data = await dataRes.json();
				const positions = await posRes.json();

				// Convert people object to array if needed
				let peopleArray: Person[] = [];
				if (Array.isArray(data.people)) {
					peopleArray = data.people;
				} else if (typeof data.people === 'object' && data.people !== null) {
					peopleArray = Object.values(data.people);
				}

				// Convert relationships format (source/target -> id1/id2)
				let relationsArray: Relation[] = [];
				if (Array.isArray(data.relationships)) {
					relationsArray = data.relationships.map((rel: any) => ({
						id1: rel.source || rel.id1,
						id2: rel.target || rel.id2,
						type: rel.type
					}));
				}

				set({
					people: peopleArray,
					relations: relationsArray,
					positions: positions || {}
				});
			} catch (error) {
				console.error('Failed to load graph data:', error);
			}
		},
		searchPeople: (query: string) => {
			if (!query.trim()) {
				return [];
			}
			const q = query.toLowerCase();
			return currentData.people.filter(p =>
				p.name?.toLowerCase().includes(q) ||
                p.id?.toLowerCase().includes(q)
			).slice(0, 10);
		}
	};
}

export const graphStore = createGraphStore();

export const searchQuery = writable('');
export const selectedPersonId = writable<string | null>(null);
