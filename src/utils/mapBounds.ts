import { TopologyMap, TopologyNode, TopologyView } from '../types';
import { clamp } from './mapCoords';
import { MAX_SCALE, MIN_SCALE } from './zoomMath';

export interface MapContentBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

/**
 * Espessura das barras nativas do mapa. Precisa bater com `::-webkit-scrollbar` em
 * `canvasStyles` — o SVG é irmão do `scrollPane` e, no Chrome, cobre a faixa da barra se
 * ocupar o wrap inteiro (o Firefox ainda entrega o arraste à scrollbar nativa).
 */
export const MAP_NATIVE_SCROLLBAR_PX = 22;

/** Área do SVG / hit-test do mapa, excluindo a faixa das barras nativas. */
export function mapCanvasClientSize(wrapWidth: number, wrapHeight: number): { w: number; h: number } {
  return {
    w: Math.max(0, wrapWidth - MAP_NATIVE_SCROLLBAR_PX),
    h: Math.max(0, wrapHeight - MAP_NATIVE_SCROLLBAR_PX),
  };
}

interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boundsFromExtents(x0: number, y0: number, x1: number, y1: number, pad: number): MapContentBounds {
  const paddedX0 = x0 - pad;
  const paddedY0 = y0 - pad;
  const paddedX1 = x1 + pad;
  const paddedY1 = y1 + pad;
  return {
    x0: paddedX0,
    y0: paddedY0,
    x1: paddedX1,
    y1: paddedY1,
    width: Math.max(paddedX1 - paddedX0, 1),
    height: Math.max(paddedY1 - paddedY0, 1),
  };
}

/**
 * Retângulo mínimo que engloba só a topologia desenhada (nós + waypoints de links).
 * Usado no fit inicial ao abrir/trocar mapas — evita centralizar pelo canvas vazio do JSON.
 */
export function computeTopologyFitBounds(
  map: TopologyMap,
  nodeLayouts: Map<string, LayoutBox>
): MapContentBounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;

  for (const layout of nodeLayouts.values()) {
    x0 = Math.min(x0, layout.x);
    y0 = Math.min(y0, layout.y);
    x1 = Math.max(x1, layout.x + layout.w);
    y1 = Math.max(y1, layout.y + layout.h);
  }

  for (const link of map.links) {
    for (const wp of link.waypoints ?? []) {
      x0 = Math.min(x0, wp.x);
      y0 = Math.min(y0, wp.y);
      x1 = Math.max(x1, wp.x);
      y1 = Math.max(y1, wp.y);
    }
  }

  if (!Number.isFinite(x0)) {
    return boundsFromExtents(0, 0, map.width, map.height, 48);
  }

  return boundsFromExtents(x0, y0, x1, y1, 48);
}

/** Área do mapa que engloba dimensões do JSON e todos os nós posicionados. */
export function computeTopologyContentBounds(
  map: TopologyMap,
  nodeLayouts: Map<string, LayoutBox>
): MapContentBounds {
  let x0 = 0;
  let y0 = 0;
  let x1 = map.width;
  let y1 = map.height;

  for (const layout of nodeLayouts.values()) {
    x0 = Math.min(x0, layout.x);
    y0 = Math.min(y0, layout.y);
    x1 = Math.max(x1, layout.x + layout.w);
    y1 = Math.max(y1, layout.y + layout.h);
  }

  return boundsFromExtents(x0, y0, x1, y1, 48);
}

export function isNetworkNode(node: TopologyNode): boolean {
  return node.type === 'network';
}

/** Tamanho da área rolável e posição do scroll equivalentes ao pan atual. */
interface MapScrollMetrics {
  contentWidth: number;
  contentHeight: number;
  scrollLeft: number;
  scrollTop: number;
  maxScrollLeft: number;
  maxScrollTop: number;
}

/**
 * Converte bounds do conteúdo + view (pan/zoom) em métricas de scroll nativo.
 * Scrollbars aparecem só quando o conteúdo (hosts/redes) ultrapassa o viewport na escala atual.
 */
export function computeMapScrollMetrics(
  bounds: MapContentBounds,
  view: TopologyView,
  viewportW: number,
  viewportH: number
): MapScrollMetrics {
  if (viewportW <= 0 || viewportH <= 0 || view.scale <= 0) {
    return {
      contentWidth: Math.max(viewportW, 1),
      contentHeight: Math.max(viewportH, 1),
      scrollLeft: 0,
      scrollTop: 0,
      maxScrollLeft: 0,
      maxScrollTop: 0,
    };
  }

  const contentWidth = Math.max(viewportW, bounds.width * view.scale);
  const contentHeight = Math.max(viewportH, bounds.height * view.scale);
  const maxScrollLeft = Math.max(0, contentWidth - viewportW);
  const maxScrollTop = Math.max(0, contentHeight - viewportH);
  const scrollLeft = clamp(-view.x - bounds.x0 * view.scale, 0, maxScrollLeft);
  const scrollTop = clamp(-view.y - bounds.y0 * view.scale, 0, maxScrollTop);

  return {
    contentWidth,
    contentHeight,
    scrollLeft,
    scrollTop,
    maxScrollLeft,
    maxScrollTop,
  };
}

/**
 * Delta de pan correspondente a uma mudança de `scrollLeft`/`scrollTop` nativo.
 * Delta, e não pan absoluto reconstruído a partir do scroll: o inset de um mapa centralizado não
 * cabe em `scrollLeft` (clamped a 0), e a conversão absoluta puxaria o mapa para a esquerda no
 * primeiro evento da barra.
 */
export function viewPanDeltaFromScroll(
  prevScrollLeft: number,
  prevScrollTop: number,
  nextScrollLeft: number,
  nextScrollTop: number
): { dx: number; dy: number } {
  return {
    dx: prevScrollLeft - nextScrollLeft,
    dy: prevScrollTop - nextScrollTop,
  };
}

/**
 * Fit do viewport para um retangulo arbitrário de bounds no sistema de coordenadas do mapa
 * (`bounds.x0/y0` são offsets do conteúdo).
 */
export function computeFitToContentBoundsTransform(
  bounds: MapContentBounds,
  clientWidth: number,
  clientHeight: number,
  pad = 24
): TopologyView | null {
  if (!bounds.width || !bounds.height || clientWidth <= 0 || clientHeight <= 0) {
    return null;
  }
  if (clientWidth <= pad * 2 || clientHeight <= pad * 2) {
    return null;
  }

  const sx = (clientWidth - pad * 2) / bounds.width;
  const sy = (clientHeight - pad * 2) / bounds.height;
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return null;
  }

  const scale = clamp(Math.min(sx, sy), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: (clientWidth - bounds.width * scale) / 2 - bounds.x0 * scale,
    y: (clientHeight - bounds.height * scale) / 2 - bounds.y0 * scale,
  };
}

export interface TopologyFitViewportRecord {
  navKey: string;
  w: number;
  h: number;
}

/** Crescimento mínimo do painel (px) para reencaixar — maximizar o card, não barra de rolagem. */
export const TOPOLOGY_FIT_VIEWPORT_GROW_PX = 40;

/**
 * Reaplica o fit ao trocar de mapa/tela cheia, ou quando o viewport cresce de fato
 * (card maximizado). Refresh de status não muda o tamanho — não reencaixa, preserva o zoom.
 */
export function shouldApplyNavigationFit(
  prev: TopologyFitViewportRecord | null,
  navKey: string,
  w: number,
  h: number,
  growPx = TOPOLOGY_FIT_VIEWPORT_GROW_PX
): boolean {
  if (!prev || prev.navKey !== navKey) {
    return true;
  }
  return w > prev.w + growPx || h > prev.h + growPx;
}
