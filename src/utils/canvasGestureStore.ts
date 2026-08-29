import { AlignGuideLine } from './alignGuides';
import { DragPreview } from './dragState';

export type MarqueeRect = { x0: number; y0: number; x1: number; y1: number };

/** Preview de gesto que o SVG assina — fora do `useState` do canvas, para o pointermove não
 * redesenhar toolbar, minimapa e o restante dos hooks. */
export interface CanvasGestureUi {
  dragPreview: DragPreview;
  alignGuides: AlignGuideLine[];
  marqueeRect: MarqueeRect | null;
}

export const EMPTY_CANVAS_GESTURE_UI: CanvasGestureUi = {
  dragPreview: null,
  alignGuides: [],
  marqueeRect: null,
};

export interface CanvasGestureStore {
  subscribe: (listener: () => void) => () => void;
  get: () => CanvasGestureUi;
  set: (patch: Partial<CanvasGestureUi>) => void;
  reset: () => void;
}

function isEmptyUi(ui: CanvasGestureUi): boolean {
  return ui.dragPreview == null && ui.alignGuides.length === 0 && ui.marqueeRect == null;
}

/** Store de um canvas: um gesto por vez, lido no rAF pelo `GesturePreviewLayers`. */
export function createCanvasGestureStore(): CanvasGestureStore {
  let snapshot: CanvasGestureUi = EMPTY_CANVAS_GESTURE_UI;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => snapshot,
    set: (patch) => {
      snapshot = { ...snapshot, ...patch };
      emit();
    },
    reset: () => {
      if (isEmptyUi(snapshot)) {
        return;
      }
      snapshot = EMPTY_CANVAS_GESTURE_UI;
      emit();
    },
  };
}
