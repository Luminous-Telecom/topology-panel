import { MutableRefObject, RefObject, useEffect } from 'react';
import { TopologyView } from '../types';
import {
  eventTargetsElement,
  eventTargetsMapOverlay,
  findScrollParents,
  wheelTargetsScrollableDescendant,
} from '../utils/domScroll';
import { pinchZoom, PinchStart, wheelZoom } from '../utils/zoomMath';

interface UseCanvasZoomGesturesParams {
  wrapRef: RefObject<HTMLElement>;
  /** Elemento de medida do viewport — a origem das coordenadas do zoom. */
  resolveSizeEl: () => HTMLElement | null;
  viewRef: MutableRefObject<TopologyView>;
  commitView: (next: TopologyView | ((prev: TopologyView) => TopologyView)) => void;
  enableZoom: boolean;
  /** Só para paridade com o efeito original (reatacha os listeners quando a Query adiciona ou
   * remove hosts). */
  mapNodesLength: number;
  /** Chamado quando um pinch de 2 dedos começa — cancela pan/drag de 1 dedo em andamento. */
  onPinchStart: () => void;
  pinchActiveRef: MutableRefObject<boolean>;
}

/**
 * Zoom por roda do mouse e pinch de dois dedos, e bloqueio do scroll nativo no toque de 1 dedo.
 *
 * Os listeners são nativos e não passivos porque precisam de `preventDefault`: sem isso o
 * navegador (e o dashboard do Grafana) rola a página no lugar do pan/zoom do mapa. O
 * `onPointerMove` do React não basta — em mobile esse listener costuma ser passivo, e o
 * primeiro `touchmove` sem `preventDefault` cancela o ponteiro (`pointercancel`).
 */
export function useCanvasZoomGestures({
  wrapRef,
  resolveSizeEl,
  viewRef,
  commitView,
  enableZoom,
  mapNodesLength,
  onPinchStart,
  pinchActiveRef,
}: UseCanvasZoomGesturesParams) {
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }

    const scrollParents = findScrollParents(el);

    // Não mutar `overflow` dos ancestrais do Grafana: no modo edição isso
    // colapsa o grid do card (`height: -1` / 0px). O zoom já chama
    // preventDefault no wheel sobre o painel.

    let pinch: PinchStart | null = null;
    let pinchRaf: number | null = null;
    let pinchPending: TopologyView | null = null;
    /** View acumulada da roda no frame — scroll rápido entrega vários eventos entre dois paints. */
    let wheelRaf: number | null = null;
    let wheelPending: TopologyView | null = null;

    const sizeRect = () => (resolveSizeEl() ?? el).getBoundingClientRect();

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
      const rect = sizeRect();
      return {
        dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY) || 1,
        midX: (a.clientX + b.clientX) / 2 - rect.left,
        midY: (a.clientY + b.clientY) / 2 - rect.top,
      };
    };

    const flushWheel = () => {
      wheelRaf = null;
      if (!wheelPending) {
        return;
      }
      const next = wheelPending;
      wheelPending = null;
      commitView(next);
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

    const cancelWheel = () => {
      if (wheelRaf != null) {
        cancelAnimationFrame(wheelRaf);
        wheelRaf = null;
      }
      wheelPending = null;
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
      pinch = { dist: pair.dist, midX: pair.midX, midY: pair.midY, view: { ...viewRef.current } };
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
      pinchPending = pinchZoom(pinch, pair.dist, pair.midX, pair.midY);
      if (pinchRaf == null) {
        pinchRaf = requestAnimationFrame(flushPinch);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        endPinch();
      }
    };

    /** O zoom muda a altura do conteúdo; sem congelar, o painel do dashboard salta junto. */
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
      // Mesmo evento chega por mais de um alvo (document, painel, ancestrais roláveis).
      if (e.timeStamp === lastWheelTs || !eventTargetsElement(e, el)) {
        return;
      }
      if (wheelTargetsScrollableDescendant(e, el)) {
        return;
      }
      lastWheelTs = e.timeStamp;

      const restoreScroll = freezeScrollPosition();
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const rect = sizeRect();
      /*
       * Um commit por frame: sem isso cada notch da roda virava um re-render do canvas inteiro.
       * O passo de `wheelZoom` é fixo (10%) e ignora a magnitude do delta, então cada evento é
       * dobrado na view pendente — somar os deltas crus faria 25 notches valerem um só.
       */
      wheelPending = wheelZoom(
        wheelPending ?? viewRef.current,
        e.clientX - rect.left,
        e.clientY - rect.top,
        e.deltaY
      );
      if (wheelRaf == null) {
        wheelRaf = requestAnimationFrame(flushWheel);
      }
      restoreScroll?.();
      requestAnimationFrame(() => restoreScroll?.());
    };

    /** 1 dedo no mapa: impede o dashboard de rolar e o browser de cancelar o pointer do pan. */
    const onOneFingerTouchMove = (evt: Event) => {
      if (!(evt instanceof TouchEvent) || evt.touches.length !== 1) {
        return;
      }
      if (!eventTargetsElement(evt, el) || eventTargetsMapOverlay(evt, el)) {
        return;
      }
      evt.preventDefault();
    };

    const captureTouchOpts: AddEventListenerOptions = { passive: false, capture: true };
    const touchGuardTargets = [document, el, ...scrollParents];
    for (const target of touchGuardTargets) {
      target.addEventListener('touchmove', onOneFingerTouchMove, captureTouchOpts);
    }

    const wheelOpts: AddEventListenerOptions = { passive: false, capture: true };
    const wheelTargets = [document, el, ...scrollParents];
    if (enableZoom) {
      for (const target of wheelTargets) {
        target.addEventListener('wheel', onWheel, wheelOpts);
      }
      el.addEventListener('touchstart', onTouchStart, { passive: false });
      el.addEventListener('touchmove', onTouchMove, { passive: false });
      el.addEventListener('touchend', onTouchEnd);
      el.addEventListener('touchcancel', onTouchEnd);
    }

    return () => {
      for (const target of touchGuardTargets) {
        target.removeEventListener('touchmove', onOneFingerTouchMove, captureTouchOpts);
      }
      if (enableZoom) {
        for (const target of wheelTargets) {
          target.removeEventListener('wheel', onWheel, wheelOpts);
        }
        el.removeEventListener('touchstart', onTouchStart);
        el.removeEventListener('touchmove', onTouchMove);
        el.removeEventListener('touchend', onTouchEnd);
        el.removeEventListener('touchcancel', onTouchEnd);
      }
      endPinch();
      cancelWheel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitView, enableZoom, mapNodesLength, onPinchStart]);
}
