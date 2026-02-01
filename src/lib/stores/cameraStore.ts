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

const BASE_MAX_PAN = 1000000;

function createCameraStore() {
	const { subscribe, set, update } = writable<CameraState>(DEFAULT_CAMERA);

	// Calcule la limite dynamique en fonction du zoom
	const calculateMaxPan = (zoom: number): number => {
		// Plus on zoom (zoom grand), plus on peut s'éloigner du centre
		return BASE_MAX_PAN * (1 / zoom);
	};

	return {
		subscribe,
		reset: () => set(DEFAULT_CAMERA),
		setTarget: (x: number, y: number, zoom?: number) => {
			update((state) => {
				const targetZoom = zoom ?? state.targetZoom;
				const maxPan = calculateMaxPan(targetZoom);
				return {
					...state,
					targetX: Math.max(-maxPan, Math.min(maxPan, x)),
					targetY: Math.max(-maxPan, Math.min(maxPan, y)),
					targetZoom
				};
			});
		},
		zoom: (delta: number, _centerX?: number, _centerY?: number) => {
			update((state) => {
				const newZoom = Math.max(0.01, Math.min(5, state.targetZoom + delta));
				return {
					...state,
					targetZoom: newZoom
				};
			});
		},
		pan: (dx: number, dy: number) => {
			update((state) => {
				const maxPan = calculateMaxPan(state.targetZoom);
				const newTargetX = Math.max(
					-maxPan,
					Math.min(maxPan, state.targetX + dx)
				);
				const newTargetY = Math.max(
					-maxPan,
					Math.min(maxPan, state.targetY + dy)
				);
				return {
					...state,
					targetX: newTargetX,
					targetY: newTargetY
				};
			});
		},
		updateSmooth: () => {
			update((state) => {
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
