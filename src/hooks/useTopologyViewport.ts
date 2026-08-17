import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { TopologyView } from '../types';
import { computeFitToViewTransform } from '../utils/mapBounds';
import { useCanvasZoomGestures } from './useCanvasZoomGestures';
import { useFullscreen } from './useFullscreen';
import { useViewportSize } from './useViewportSize';

interface UseTopologyViewportParams {
  wrapRef: RefObject<HTMLDivElement>;
  /**
   * Elemento montado cuja `clientWidth`/`clientHeight` define o viewport (ex.: painel de scroll
   * sem a largura das barras). Enquanto `null`, usa `wrapRef`.
   */
  sizeElement?: HTMLElement | null;
  mapWidth: number;
  mapHeight: number;
  savedView: TopologyView | undefined;
  onViewChange?: (view: TopologyView) => void;
  enableZoom: boolean;
  /** Troca de mapa na navegação hierárquica — reinicia pan/zoom salvo ou fit. */
  viewResetKey?: string;
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
  fitToView: () => void;
  /** True enquanto um pinch de 2 dedos está ativo — bloqueia pan de 1 dedo. */
  pinchActiveRef: MutableRefObject<boolean>;
}

/**
 * View do canvas (x/y/scale) e o fitToView inicial, compondo `useViewportSize` (medida do painel),
 * `useFullscreen` e `useCanvasZoomGestures` (roda e pinch). Não inclui o pan de 1 dedo nem a
 * máquina de estado de arraste de nó/rede/marquee, que ficam em `useTopologyDragController`
 * (acionado a partir de `onPointerMove`/`onPointerDown` do React).
 */
export function useTopologyViewport({
  wrapRef,
  sizeElement = null,
  mapWidth,
  mapHeight,
  savedView,
  onViewChange,
  enableZoom,
  mapNodesLength,
  onPinchStart,
  onFullscreenChange,
  showToast,
  viewResetKey = 'default',
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

  const fitToView = useCallback(() => {
    const el = resolveSizeEl();
    if (!el) {
      return;
    }
    const transform = computeFitToViewTransform(mapWidth, mapHeight, el.clientWidth, el.clientHeight);
    if (!transform) {
      return;
    }
    commitView(transform);
  }, [commitView, mapWidth, mapHeight, resolveSizeEl]);

  const didInitialFitRef = useRef(false);
  const prevViewResetKeyRef = useRef(viewResetKey);

  useEffect(() => {
    if (prevViewResetKeyRef.current === viewResetKey && didInitialFitRef.current) {
      return;
    }
    prevViewResetKeyRef.current = viewResetKey;
    if (!mapWidth || !mapHeight) {
      return;
    }
    if (savedView && typeof savedView.scale === 'number') {
      commitView(savedView);
    } else {
      fitToView();
    }
    didInitialFitRef.current = true;
  }, [commitView, fitToView, mapWidth, mapHeight, savedView, viewResetKey]);

  // Grava a view no mapa só depois que o usuário para de mexer, para não persistir cada frame.
  useEffect(() => {
    if (!onViewChange || !didInitialFitRef.current) {
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
    fitToView,
    pinchActiveRef,
  };
}
