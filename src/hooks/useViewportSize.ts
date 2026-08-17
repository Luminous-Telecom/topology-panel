import { MutableRefObject, RefObject, useEffect, useRef, useState } from 'react';

interface UseViewportSizeParams {
  wrapRef: RefObject<HTMLElement>;
  /** Elemento cuja client area define o viewport; enquanto `null`, vale o `wrapRef`. */
  sizeElement: HTMLElement | null;
  sizeElementRef: MutableRefObject<HTMLElement | null>;
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
      const target = sizeElementRef.current ?? wrapRef.current;
      if (!target) {
        return;
      }
      const w = target.clientWidth;
      const h = target.clientHeight;
      // Zero significa painel escondido (aba inativa, colapso do grid) — manter a última medida
      // boa evita um fitToView contra um viewport inexistente.
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
  }, [sizeElement, sizeElementRef, wrapRef]);

  return { viewport, viewportRef };
}
