import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { TopologyView } from '../types';
import { useCanvasZoomGestures } from './useCanvasZoomGestures';
import { useFullscreen } from './useFullscreen';
import { useViewportSize } from './useViewportSize';

interface UseTopologyViewportParams {
  wrapRef: RefObject<HTMLDivElement>;
  /**
   * Elemento montado cuja `clientWidth`/`clientHeight` define o viewport. Por padrão usa o
   * `wrapRef` (overflow hidden) — nunca o painel de scroll, cujo client area encolhe quando
   * as barras nativas aparecem e re-dispara o ResizeObserver em loop.
   */
  sizeElement?: HTMLElement | null;
  savedView: TopologyView | undefined;
  onViewChange?: (view: TopologyView) => void;
  enableZoom: boolean;
  /** Só para paridade com o efeito original (reatacha os listeners de wheel/touch quando a
   * Query adiciona/remove hosts) — ver achado de performance documentado no relatório da
   * auditoria; não corrigido aqui para não mudar comportamento fora do escopo pedido. */
  mapNodesLength: number;
  /** Chamado quando um pinch de 2 dedos começa — cancela pan/drag de 1 dedo em andamento. */
  onPinchStart: () => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  showToast: (message: string | undefined) => void;
}

interface UseTopologyViewportResult {
  view: TopologyView;
  viewRef: MutableRefObject<TopologyView>;
  commitView: (next: TopologyView | ((prev: TopologyView) => TopologyView)) => void;
  viewport: { w: number; h: number };
  viewportRef: MutableRefObject<{ w: number; h: number }>;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<void>;
  /** True enquanto um pinch de 2 dedos está ativo — bloqueia pan de 1 dedo. */
  pinchActiveRef: MutableRefObject<boolean>;
}

/**
 * View do canvas (x/y/scale), compondo `useViewportSize` (medida do painel), `useFullscreen` e
 * `useCanvasZoomGestures` (roda e pinch). Não inclui o fit de entrada no mapa (fica em
 * `TopologyCanvas.tsx`, pelo bounding box da topologia desenhada), nem o pan de 1 dedo, nem a
 * máquina de estado de arraste de nó/rede/marquee, que ficam em `useTopologyDragController`
 * (acionado a partir de `onPointerMove`/`onPointerDown` do React).
 */
export function useTopologyViewport({
  wrapRef,
  sizeElement = null,
  savedView,
  onViewChange,
  enableZoom,
  mapNodesLength,
  onPinchStart,
  onFullscreenChange,
  showToast,
}: UseTopologyViewportParams): UseTopologyViewportResult {
  const sizeElementRef = useRef<HTMLElement | null>(sizeElement);
  sizeElementRef.current = sizeElement;
  const resolveSizeEl = useCallback((): HTMLElement | null => sizeElementRef.current ?? wrapRef.current, [wrapRef]);
  const [view, setView] = useState<TopologyView>(() =>
    savedView && typeof savedView.scale === 'number' ? savedView : { x: 0, y: 0, scale: 1 }
  );
  const viewRef = useRef(view);
  const commitView = useCallback((next: TopologyView | ((prev: TopologyView) => TopologyView)) => {
    if (typeof next === 'function') {
      setView((prev) => {
        const resolved = next(prev);
        viewRef.current = resolved;
        return resolved;
      });
      return;
    }
    viewRef.current = next;
    setView(next);
  }, []);
  const { viewport, viewportRef } = useViewportSize({ wrapRef, sizeElement, sizeElementRef });
  const { isFullscreen, toggleFullscreen } = useFullscreen({ wrapRef, onFullscreenChange, showToast });
  const pinchActiveRef = useRef(false);

  // Grava a view no mapa só depois que o usuário para de mexer, para não persistir cada frame.
  useEffect(() => {
    if (!onViewChange) {
      return;
    }
    if (savedView && savedView.x === view.x && savedView.y === view.y && savedView.scale === view.scale) {
      return;
    }
    const timer = window.setTimeout(() => onViewChange(view), 400);
    return () => window.clearTimeout(timer);
  }, [onViewChange, savedView, view]);

  useCanvasZoomGestures({
    wrapRef,
    resolveSizeEl,
    viewRef,
    commitView,
    enableZoom,
    mapNodesLength,
    onPinchStart,
    pinchActiveRef,
  });

  return {
    view,
    viewRef,
    commitView,
    viewport,
    viewportRef,
    isFullscreen,
    toggleFullscreen,
    pinchActiveRef,
  };
}
