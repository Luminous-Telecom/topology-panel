/**
 * Alvo do portal de overlays (menu Tools, hover, toast).
 * Em tela cheia o navegador só pinta o `fullscreenElement` — portal em `document.body` some.
 */
export function overlayPortalRoot(): HTMLElement {
  const fullscreen = document.fullscreenElement;
  if (fullscreen instanceof HTMLElement) {
    return fullscreen;
  }
  return document.body;
}

/** Recorte do canvas — o painel Grafana tem overflow hidden e corta overlays no rodapé. */
export const TOPOLOGY_CANVAS_SELECTOR = '[data-topology-canvas]';

export interface OverlayBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function overlayBoxFromRect(rect: DOMRect): OverlayBox {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** Área visível do mapa a partir de um filho; cai no viewport se o canvas não existir. */
export function overlayClipBox(from: Element | null): OverlayBox {
  const canvas = from?.closest(TOPOLOGY_CANVAS_SELECTOR);
  if (canvas instanceof HTMLElement) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width >= 1 && rect.height >= 1) {
      return overlayBoxFromRect(rect);
    }
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

/** Portal no wrap do mapa, em coordenadas locais — o painel corta overflow na borda. */
export function overlayPortalParent(from: Element | null): HTMLElement {
  const canvas = from?.closest(TOPOLOGY_CANVAS_SELECTOR);
  if (canvas instanceof HTMLElement) {
    return canvas;
  }
  return overlayPortalRoot();
}

/** Converte posição de tela para coordenada do ancestral `position: relative`. */
export function overlayLocalPosition(
  viewport: { left: number; top: number },
  parent: OverlayBox
): { left: number; top: number } {
  return { left: viewport.left - parent.left, top: viewport.top - parent.top };
}

const OVERLAY_FIT_MARGIN = 8;

/**
 * Encaixa um overlay ao lado da âncora, dentro do recorte.
 * Prefere acima e à direita — a lista de alertas fica no rodapé do painel.
 */
export function fitOverlayBesideAnchor(
  anchor: OverlayBox,
  overlay: { width: number; height: number },
  clip: OverlayBox,
  margin = OVERLAY_FIT_MARGIN
): { left: number; top: number } {
  const width = Math.min(Math.max(overlay.width, 0), Math.max(0, clip.width - margin * 2));
  const height = Math.min(Math.max(overlay.height, 0), Math.max(0, clip.height - margin * 2));
  const minLeft = clip.left + margin;
  const maxLeft = clip.left + clip.width - margin - width;
  const minTop = clip.top + margin;
  const maxTop = clip.top + clip.height - margin - height;

  let left = anchor.left + anchor.width + margin;
  if (left > maxLeft) {
    left = anchor.left - width - margin;
  }
  if (maxLeft < minLeft) {
    left = minLeft;
  } else {
    left = Math.min(Math.max(left, minLeft), maxLeft);
  }

  let top = anchor.top - height - margin;
  if (top < minTop) {
    top = anchor.top + anchor.height + margin;
  }
  if (maxTop < minTop) {
    top = minTop;
  } else {
    top = Math.min(Math.max(top, minTop), maxTop);
  }

  return { left, top };
}
