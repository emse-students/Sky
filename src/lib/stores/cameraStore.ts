import { writable } from "svelte/store";
import type { CameraState } from "$types/graph";

const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  zoom: 0.05, // Dézoomer pour voir l'ensemble du graphe
  targetX: 0,
  targetY: 0,
  targetZoom: 0.05,
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
     * Fait avancer la camera vers sa cible d un pas amorti. Renvoie `true` si la
     * camera a bouge ce frame, `false` si elle est au repos (figee sur sa cible).
     * Permet au rendu de ne dessiner qu a la demande (idle = 0 calcul) au lieu de
     * 60 fps en continu, essentiel sur mobile/PC peu puissants.
     */
    updateSmooth: (): boolean => {
      let moved = false;
      update((state) => {
        const SMOOTH = 0.15;
        const dx = state.targetX - state.x;
        const dy = state.targetY - state.y;
        const dz = state.targetZoom - state.zoom;
        // Au repos quand le deplacement restant est sous le demi-pixel ecran.
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
