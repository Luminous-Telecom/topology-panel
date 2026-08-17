import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { TopologyView } from '../types';
import { clamp, eventTargetsElement, findScrollParents } from '../utils';
import { computeFitToViewTransform } from '../utils/mapBounds';

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
 * Pan/zoom/fullscreen do canvas — view (x/y/scale), viewport (tamanho do painel), fitToView
 * inicial, ResizeObserver e o listener nativo de wheel/pinch (2 dedos). Não inclui o pan de 1
 * dedo nem a máquina de estado de arraste de nó/rede/marquee, que ficam em
 * `useTopologyDragController` (acionado a partir de `onPointerMove`/`onPointerDown` do React).
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
}: UseTopologyViewportParams): UseTopologyViewportResult {
  const sizeElementRef = useRef(sizeElement);
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
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pinchActiveRef = useRef(false);

  useEffect(() => {
    const syncFullscreen = () => {
      const el = wrapRef.current;
      const fs = Boolean(el && document.fullscreenElement === el);
      setIsFullscreen(fs);
      onFullscreenChange?.(fs);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        await el.requestFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      showToast('Não foi possível alternar a tela cheia neste navegador');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  useEffect(() => {
    if (didInitialFitRef.current || !mapWidth || !mapHeight) {
      return;
    }
    if (savedView && typeof savedView.scale === 'number') {
      commitView(savedView);
    } else {
      fitToView();
    }
    didInitialFitRef.current = true;
  }, [commitView, fitToView, mapWidth, mapHeight, savedView]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const sizeEl = sizeElement ?? wrap;
    if (!sizeEl) {
      return;
    }
    const onResize = () => {
      const target = sizeElementRef.current ?? wrapRef.current;
      if (!target) {
        return;
      }
      const w = target.clientWidth;
      const h = target.clientHeight;
      if (w > 0 && h > 0) {
        setViewport({ w, h });
      }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(sizeEl);
    if (wrap && wrap !== sizeEl) {
      ro.observe(wrap);
    }
    onResize();
    return () => ro.disconnect();
  }, [sizeElement, wrapRef]);

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

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !enableZoom) {
      return;
    }

    const scrollParents = findScrollParents(el);

    type PinchState = {
      dist0: number;
      mid0x: number;
      mid0y: number;
      view0: TopologyView;
    };
    let pinch: PinchState | null = null;
    let pinchRaf: number | null = null;
    let pinchPending: TopologyView | null = null;

    const isOverPanel = (e: Event) => eventTargetsElement(e, el);

    const applyZoomAt = (clientX: number, clientY: number, nextScale: number, from: TopologyView) => {
      const sizeEl = resolveSizeEl() ?? el;
      const rect = sizeEl.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      const ns = clamp(nextScale, 0.1, 4);
      return {
        scale: ns,
        x: mx - ((mx - from.x) * ns) / from.scale,
        y: my - ((my - from.y) * ns) / from.scale,
      };
    };

    const applyZoom = (clientX: number, clientY: number, deltaY: number) => {
      commitView((v) => {
        const delta = deltaY > 0 ? 0.9 : 1.1;
        return applyZoomAt(clientX, clientY, v.scale * delta, v);
      });
    };

    const flushPinch = () => {
      pinchRaf = null;
      if (!pinchPending) {
        return;
      }
      const next = pinchPending;
      pinchPending = null;
      commitView(next);
    };

    const touchPair = (touches: TouchList) => {
      if (touches.length < 2) {
        return null;
      }
      const a = touches[0];
      const b = touches[1];
      const sizeEl = resolveSizeEl() ?? el;
      const rect = sizeEl.getBoundingClientRect();
      return {
        dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        midX: (a.clientX + b.clientX) / 2 - rect.left,
        midY: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };

    const endPinch = () => {
      pinchActiveRef.current = false;
      pinch = null;
      if (pinchRaf != null) {
        cancelAnimationFrame(pinchRaf);
        pinchRaf = null;
      }
      if (pinchPending) {
        flushPinch();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        return;
      }
      const pair = touchPair(e.touches);
      if (!pair) {
        return;
      }
      e.preventDefault();
      // Interrompe pan/drag de 1 dedo — pinch assume o gesto.
      onPinchStart();
      pinchActiveRef.current = true;
      pinch = {
        dist0: pair.dist,
        mid0x: pair.midX,
        mid0y: pair.midY,
        view0: { ...viewRef.current },
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) {
        return;
      }
      const pair = touchPair(e.touches);
      if (!pair) {
        return;
      }
      e.preventDefault();
      const ns = clamp(pinch.view0.scale * (pair.dist / pinch.dist0), 0.1, 4);
      // Mantém o ponto do mapa sob o meio dos dedos (zoom + pan com 2 dedos).
      pinchPending = {
        scale: ns,
        x: pair.midX - ((pinch.mid0x - pinch.view0.x) * ns) / pinch.view0.scale,
        y: pair.midY - ((pinch.mid0y - pinch.view0.y) * ns) / pinch.view0.scale,
      };
      if (pinchRaf == null) {
        pinchRaf = requestAnimationFrame(flushPinch);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        endPinch();
      }
    };

    const freezeScrollPosition = () => {
      const tops = scrollParents.map((sp) => ({ sp, top: sp.scrollTop }));
      return () => {
        for (const { sp, top } of tops) {
          sp.scrollTop = top;
        }
      };
    };

    let lastWheelTs = -1;
    // Listener genérico (Event) — attachado em document/el/scrollParents, tipos mistos
    // não compartilham o overload específico de WheelEvent do addEventListener.
    const onWheel = (evt: Event) => {
      if (!(evt instanceof WheelEvent)) {
        return;
      }
      const e = evt;
      if (e.timeStamp === lastWheelTs || !isOverPanel(e)) {
        return;
      }
      lastWheelTs = e.timeStamp;

      const restoreScroll = freezeScrollPosition();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      applyZoom(e.clientX, e.clientY, e.deltaY);
      restoreScroll?.();
      requestAnimationFrame(() => restoreScroll?.());
    };

    const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
    const wheelTargets = [document, el, ...scrollParents];

    for (const target of wheelTargets) {
      target.addEventListener('wheel', onWheel, wheelOpts);
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    return () => {
      for (const target of wheelTargets) {
        target.removeEventListener('wheel', onWheel, wheelOpts);
      }
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      endPinch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitView, enableZoom, mapNodesLength, onPinchStart]);

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
