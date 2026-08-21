import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { TopologyView } from '../types';
import {
  computeMapScrollMetrics,
  MapContentBounds,
  viewPanDeltaFromScroll,
} from '../utils/mapBounds';

interface UseMapContentScrollParams {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  bounds: MapContentBounds;
  view: TopologyView;
  viewRef: MutableRefObject<TopologyView>;
  commitView: (next: TopologyView | ((prev: TopologyView) => TopologyView)) => void;
  viewport: { w: number; h: number };
  /** Mesma referência estável de `useViewportSize` — evita ler `clientWidth` do scrollPane. */
  viewportRef: MutableRefObject<{ w: number; h: number }>;
  /**
   * Enquanto `true` (pan/arraste ativo), não escreve `scrollLeft`/`scrollTop` a partir da view —
   * evita tranco por sync nativo a cada frame.
   */
  suspendSyncRef: MutableRefObject<boolean>;
}

interface UseMapContentScrollResult {
  contentWidth: number;
  contentHeight: number;
  onScroll: () => void;
  /** Alinha as barras à view atual (chamar ao soltar o ponteiro). */
  syncScrollFromView: () => void;
}

/**
 * Scroll nativo (H+V) sincronizado com o pan do mapa. O SVG fica fora deste container —
 * só o sizer rola, para as barras não brigarem com o `transform` do canvas.
 */
export function useMapContentScroll({
  scrollRef,
  bounds,
  view,
  viewRef,
  commitView,
  viewport,
  viewportRef,
  suspendSyncRef,
}: UseMapContentScrollParams): UseMapContentScrollResult {
  const ignoreScrollEventRef = useRef(false);
  /** Último `scrollLeft/scrollTop` visto no elemento — base do delta em `onScroll`. */
  const lastNativeScrollRef = useRef({ left: 0, top: 0 });

  // `true` enquanto o próprio `onScroll` está processando um evento nativo (arraste da
  // scrollbar, roda do mouse, trackpad sobre o container). Serve só para o efeito de sync
  // passivo abaixo não escrever em `scrollLeft/scrollTop` no meio do gesto do usuário — sem
  // isso, `commitView` (chamado por `onScroll`) muda `view` -> muda `metrics` -> o efeito
  // sobrescreve a posição da barra que o navegador já está controlando, competindo com o
  // próprio gesto e causando o pulo/trepidação.
  const isNativeScrollingRef = useRef(false);

  const metrics = useMemo(
    () => computeMapScrollMetrics(bounds, view, viewport.w, viewport.h),
    [bounds, view, viewport.h, viewport.w]
  );

  const rememberNativeScroll = useCallback((el: HTMLDivElement) => {
    lastNativeScrollRef.current = { left: el.scrollLeft, top: el.scrollTop };
  }, []);

  const writeScrollPosition = useCallback(
    (scrollLeft: number, scrollTop: number) => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      const nextLeft = Math.round(scrollLeft);
      const nextTop = Math.round(scrollTop);
      if (Math.abs(el.scrollLeft - nextLeft) < 1 && Math.abs(el.scrollTop - nextTop) < 1) {
        rememberNativeScroll(el);
        return;
      }
      ignoreScrollEventRef.current = true;
      el.scrollLeft = nextLeft;
      el.scrollTop = nextTop;
      rememberNativeScroll(el);
      // O evento `scroll` costuma ser síncrono ao atribuir; libera no próximo frame por segurança.
      requestAnimationFrame(() => {
        ignoreScrollEventRef.current = false;
      });
    },
    [rememberNativeScroll, scrollRef]
  );

  const syncScrollFromView = useCallback(() => {
    if (suspendSyncRef.current) {
      return;
    }
    const { w, h } = viewportRef.current;
    if (!scrollRef.current || w <= 0 || h <= 0) {
      return;
    }
    const next = computeMapScrollMetrics(bounds, viewRef.current, w, h);
    writeScrollPosition(next.scrollLeft, next.scrollTop);
  }, [bounds, scrollRef, suspendSyncRef, viewRef, viewportRef, writeScrollPosition]);

  // Sync passivo: zoom / commit externo — nunca durante pan (suspendSyncRef) nem durante um
  // scroll nativo em andamento (isNativeScrollingRef), pra não brigar com o navegador enquanto
  // ele ainda está movendo a barra a partir do gesto do próprio usuário.
  useEffect(() => {
    if (suspendSyncRef.current || isNativeScrollingRef.current) {
      return;
    }
    writeScrollPosition(metrics.scrollLeft, metrics.scrollTop);
  }, [metrics.scrollLeft, metrics.scrollTop, suspendSyncRef, writeScrollPosition]);

  const onScroll = useCallback(() => {
    // Não checa `suspendSyncRef` aqui: durante o arraste da própria barra de rolagem nativa,
    // `scrollLeft/scrollTop` é a fonte de verdade e este é o único caminho que atualiza a view a
    // partir dela.
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    const prevLeft = lastNativeScrollRef.current.left;
    const prevTop = lastNativeScrollRef.current.top;
    rememberNativeScroll(el);

    if (ignoreScrollEventRef.current) {
      return;
    }

    isNativeScrollingRef.current = true;

    const current = viewRef.current;
    const { w, h } = viewportRef.current;
    const nextMetrics = computeMapScrollMetrics(bounds, current, w, h);
    if (nextMetrics.maxScrollLeft <= 0 && nextMetrics.maxScrollTop <= 0) {
      isNativeScrollingRef.current = false;
      return;
    }

    const { dx, dy } = viewPanDeltaFromScroll(prevLeft, prevTop, el.scrollLeft, el.scrollTop);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      isNativeScrollingRef.current = false;
      return;
    }

    // Delta, não pan absoluto: mapa centralizado satura `scrollLeft` em 0, e reconstruir o
    // pan a partir de 0 encostaria o conteúdo à esquerda no primeiro evento da barra.
    // Commit direto, sem rAF de batching: o navegador já entrega `scroll` no máximo 1x por
    // frame, então um segundo estágio de throttling só adiciona um frame de atraso entre a
    // posição da barra (que o navegador já moveu) e o conteúdo do mapa (que só acompanha depois
    // do commit + re-render) — é esse atraso que aparece como "pulo" ao segurar a scrollbar.
    commitView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));

    // Libera o guard depois que o commit e o efeito de sync passivo (que roda em resposta a
    // ele) já tiveram a chance de rodar neste ciclo, evitando reabrir a janela de corrida entre
    // os dois sentidos (scroll -> view e view -> scroll) dentro do mesmo evento.
    requestAnimationFrame(() => {
      isNativeScrollingRef.current = false;
    });
  }, [bounds, commitView, rememberNativeScroll, scrollRef, viewRef, viewportRef]);

  return {
    contentWidth: metrics.contentWidth,
    contentHeight: metrics.contentHeight,
    onScroll,
    syncScrollFromView,
  };
}