import { RefObject, useEffect, useRef } from 'react';
import { LinkFlowController, startLinkFlowAnimation } from '../utils/linkFlow';

/** Anima os tracejados de download/upload dos links (velocidade via SNMP / utilização). */
export function useLinkFlowAnimation(wrapRef: RefObject<HTMLDivElement>): void {
  const linkFlowRef = useRef<LinkFlowController | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) {
      return;
    }
    const controller = startLinkFlowAnimation(el);
    linkFlowRef.current = controller;
    // Aba oculta não desenha: manter o laço rodando só gastava CPU no dashboard esquecido aberto.
    const syncPaused = () => controller.setPaused(document.hidden);
    syncPaused();
    document.addEventListener('visibilitychange', syncPaused);
    return () => {
      document.removeEventListener('visibilitychange', syncPaused);
      controller.stop();
      if (linkFlowRef.current === controller) {
        linkFlowRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
