import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { LinkFlowController, startLinkFlowAnimation } from '../utils/linkFlow';

interface LinkFlowAnimationOptions {
  /** Acorda o laço quando a Query fica pronta. */
  queryReady?: boolean;
  /** Escala do canvas — o zoom invalida o offset-path cacheado das setas. */
  viewScale?: number;
}

/** Anima os tracejados de download/upload dos links (velocidade via SNMP / utilização). */
export function useLinkFlowAnimation(
  wrapRef: RefObject<HTMLDivElement>,
  { queryReady, viewScale = 1 }: LinkFlowAnimationOptions = {}
): void {
  const linkFlowRef = useRef<LinkFlowController | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const controller = startLinkFlowAnimation(el);
    controller.setViewScale(viewScale);
    linkFlowRef.current = controller;
    // Aba oculta não desenha: manter o laço rodando só gastava CPU no dashboard esquecido aberto.
    const syncPaused = () => {
      controller.setPaused(document.hidden);
    };
    syncPaused();
    document.addEventListener('visibilitychange', syncPaused);
    return () => {
      document.removeEventListener('visibilitychange', syncPaused);
      controller.stop();
      if (linkFlowRef.current === controller) {
        linkFlowRef.current = null;
      }
    };
  }, [wrapRef]);

  useLayoutEffect(() => {
    linkFlowRef.current?.setViewScale(viewScale);
    linkFlowRef.current?.wake();
  }, [queryReady, viewScale]);
}
