import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { LinkFlowController, startLinkFlowAnimation } from '../utils/linkFlow';
import { CanvasGestureStore } from '../utils/canvasGestureStore';

interface LinkFlowAnimationOptions {
  /** Acorda o laço quando a Query fica pronta. */
  queryReady?: boolean;
  /** Escala do canvas — o zoom invalida o offset-path cacheado das setas. */
  viewScale?: number;
  /** Pausa a animação durante arraste, laço ou pan com preview ativo. */
  gestureStore?: CanvasGestureStore;
  /** Troca de mapa/submapa — faixas novas entram no laço sem esperar o scan de 250 ms. */
  navigationKey?: string;
}

function gestureBlocksLinkFlow(store: CanvasGestureStore): boolean {
  const ui = store.get();
  return ui.dragPreview != null || ui.marqueeRect != null;
}

/** Anima os tracejados de download/upload dos links (velocidade via SNMP / utilização). */
export function useLinkFlowAnimation(
  wrapRef: RefObject<HTMLDivElement>,
  { queryReady, viewScale = 1, gestureStore, navigationKey }: LinkFlowAnimationOptions = {}
): void {
  const linkFlowRef = useRef<LinkFlowController | null>(null);
  const viewScaleRef = useRef(viewScale);
  viewScaleRef.current = viewScale;

  const syncPaused = (controller: LinkFlowController) => {
    const gesturing = gestureStore ? gestureBlocksLinkFlow(gestureStore) : false;
    controller.setPaused(document.hidden || gesturing);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const controller = startLinkFlowAnimation(el);
    controller.setViewScale(viewScale);
    linkFlowRef.current = controller;
    syncPaused(controller);
    const onVisibility = () => syncPaused(controller);
    document.addEventListener('visibilitychange', onVisibility);
    const unsubGesture = gestureStore?.subscribe(() => syncPaused(controller));
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      unsubGesture?.();
      controller.stop();
      if (linkFlowRef.current === controller) {
        linkFlowRef.current = null;
      }
    };
  }, [gestureStore, wrapRef]);

  useLayoutEffect(() => {
    const controller = linkFlowRef.current;
    if (!controller) {
      return;
    }
    controller.setViewScale(viewScale);
    syncPaused(controller);
    controller.wake();
  }, [gestureStore, queryReady, viewScale, navigationKey]);
}
