import { MutableRefObject, RefObject, useEffect, useRef, useState } from 'react';

interface UseViewportSizeParams {
  wrapRef: RefObject<HTMLElement>;
  /** Elemento cuja client area define o viewport; enquanto `null`, vale o `wrapRef`. */
  sizeElement: HTMLElement | null;
  sizeElementRef: MutableRefObject<HTMLElement | null>;
}

function resolveMeasureTarget(
  wrap: HTMLElement | null,
  sizeElementRef: MutableRefObject<HTMLElement | null>
): HTMLElement | null {
  if (wrap && document.fullscreenElement === wrap) {
    return wrap;
  }
  return sizeElementRef.current ?? wrap;
}

/** Tamanho útil do painel, observado no elemento de medida e no wrap. */
export function useViewportSize({ wrapRef, sizeElement, sizeElementRef }: UseViewportSizeParams) {
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;

  useEffect(() => {
    const wrap = wrapRef.current;
    const sizeEl = sizeElement ?? wrap;
    if (!sizeEl) {
      return;
    }
    const onResize = () => {
      const target = resolveMeasureTarget(wrapRef.current, sizeElementRef);
      if (!target) {
        return;
      }
      const w = target.clientWidth;
      const h = target.clientHeight;
      // Zero significa painel escondido (aba inativa, colapso do grid) — manter a última medida
      // boa evita um fit contra um viewport inexistente.
      if (w > 0 && h > 0 && (w !== viewportRef.current.w || h !== viewportRef.current.h)) {
        setViewport({ w, h });
      }
    };
    const onFullscreenChange = () => {
      requestAnimationFrame(onResize);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(sizeEl);
    if (wrap && wrap !== sizeEl) {
      ro.observe(wrap);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    onResize();
    return () => {
      ro.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [sizeElement, sizeElementRef, wrapRef]);

  return { viewport, viewportRef };
}
