import { writable } from 'svelte/store';
import type { CameraState } from '$types/graph';

const DEFAULT_CAMERA: CameraState = {
	x: 0,
	y: 0,
	zoom: 0.05, // Dézoomer pour voir l'ensemble du graphe
	targetX: 0,
	targetY: 0,
	targetZoom: 0.05
};

function createCameraStore() {
	const { subscribe, set, update } = writable<CameraState>(DEFAULT_CAMERA);

	return {
		subscribe,
		reset: () => set(DEFAULT_CAMERA),
		setTarget: (x: number, y: number, zoom?: number) => {
			update(state => ({
				...state,
				targetX: x,
				targetY: y,
				targetZoom: zoom ?? state.targetZoom
			}));
		},
		zoom: (delta: number, _centerX?: number, _centerY?: number) => {
			update(state => {
				const newZoom = Math.max(0.1, Math.min(5, state.targetZoom + delta));
				return {
					...state,
					targetZoom: newZoom
				};
			});
		},
		pan: (dx: number, dy: number) => {
			update(state => ({
				...state,
				targetX: state.targetX + dx,
				targetY: state.targetY + dy
			}));
		},
		updateSmooth: () => {
			update(state => {
				const SMOOTH = 0.1;
				return {
					...state,
					x: state.x + (state.targetX - state.x) * SMOOTH,
					y: state.y + (state.targetY - state.y) * SMOOTH,
					zoom: state.zoom + (state.targetZoom - state.zoom) * SMOOTH
				};
			});
		}
	};
}

export const cameraStore = createCameraStore();
