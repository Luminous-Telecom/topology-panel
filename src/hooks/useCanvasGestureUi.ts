import { useSyncExternalStore } from 'react';
import { CanvasGestureStore, CanvasGestureUi } from '../utils/canvasGestureStore';

/** Assina o preview de gesto do canvas. Só o assinante redesenha no `pointermove`. */
export function useCanvasGestureUi(store: CanvasGestureStore): CanvasGestureUi {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
