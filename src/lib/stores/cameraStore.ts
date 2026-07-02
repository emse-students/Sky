import { writable } from "svelte/store";
import type { CameraState } from "$types/graph";

const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  zoom: 0.05, // Zoomed out to see the whole graph
  targetX: 0,
  targetY: 0,
  targetZoom: 0.05,
};

const BASE_MAX_PAN = 1000000;

function createCameraStore() {
  const { subscribe, set, update } = writable<CameraState>(DEFAULT_CAMERA);

  // Compute the dynamic pan limit as a function of zoom.
  const calculateMaxPan = (zoom: number): number => {
    // The more zoomed in (larger zoom), the further one can pan from the center.
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
          targetZoom,
        };
      });
    },
    zoom: (delta: number, _centerX?: number, _centerY?: number) => {
      update((state) => {
        const newZoom = Math.max(0.01, Math.min(5, state.targetZoom + delta));
        return {
          ...state,
          targetZoom: newZoom,
        };
      });
    },
    pan: (dx: number, dy: number) => {
      update((state) => {
        const maxPan = calculateMaxPan(state.targetZoom);
        const newTargetX = Math.max(
          -maxPan,
          Math.min(maxPan, state.targetX + dx),
        );
        const newTargetY = Math.max(
          -maxPan,
          Math.min(maxPan, state.targetY + dy),
        );
        return {
          ...state,
          targetX: newTargetX,
          targetY: newTargetY,
        };
      });
    },
    /**
     * Advance the camera toward its target by one damped step. Returns `true` if
     * the camera moved this frame, `false` if it is at rest (settled on target).
     * Lets the renderer draw on demand only (idle = 0 work) instead of a
     * continuous 60 fps, essential on low-power mobile/PC.
     */
    updateSmooth: (): boolean => {
      let moved = false;
      update((state) => {
        const SMOOTH = 0.15;
        const dx = state.targetX - state.x;
        const dy = state.targetY - state.y;
        const dz = state.targetZoom - state.zoom;
        // At rest when the remaining move is below half a screen pixel.
        const panRest =
          Math.abs(dx) < 0.5 / state.zoom && Math.abs(dy) < 0.5 / state.zoom;
        const zoomRest = Math.abs(dz) < 0.0002;
        if (panRest && zoomRest) {
          if (
            state.x !== state.targetX ||
            state.y !== state.targetY ||
            state.zoom !== state.targetZoom
          ) {
            moved = true;
            return {
              ...state,
              x: state.targetX,
              y: state.targetY,
              zoom: state.targetZoom,
            };
          }
          return state;
        }
        moved = true;
        return {
          ...state,
          x: state.x + dx * SMOOTH,
          y: state.y + dy * SMOOTH,
          zoom: state.zoom + dz * SMOOTH,
        };
      });
      return moved;
    },
  };
}

export const cameraStore = createCameraStore();
