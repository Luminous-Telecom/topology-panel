import { TopologyMap, TopologyNode, TopologyView } from '../types';
import { clamp } from '../utils';

export interface MapContentBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
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

  const pad = 48;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;

  return {
    x0,
    y0,
    x1,
    y1,
    width: Math.max(x1 - x0, 1),
    height: Math.max(y1 - y0, 1),
  };
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

/** Pan (view.x/y) correspondente a uma posição de scroll nativo.
 * Só é o inverso de `computeMapScrollMetrics` quando o pan cabe no intervalo
 * `[0, maxScroll]` — mapa centralizado (pan além da origem do conteúdo) satura
 * em `scrollLeft = 0` e esta função devolve o pan encostado à esquerda. */
export function viewPanFromScroll(
  scrollLeft: number,
  scrollTop: number,
  scale: number,
  bounds: MapContentBounds
): Pick<TopologyView, 'x' | 'y'> {
  return {
    x: -bounds.x0 * scale - scrollLeft,
    y: -bounds.y0 * scale - scrollTop,
  };
}

/**
 * Delta de pan correspondente a uma mudança de `scrollLeft`/`scrollTop` nativo.
 * Usar o delta — e não `viewPanFromScroll` absoluto — ao arrastar a scrollbar:
 * o inset de um mapa centralizado não cabe em `scrollLeft` (clamped a 0), e a
 * conversão absoluta puxaria o mapa para a esquerda no primeiro evento.
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
 * Escala/posição para o fit inicial do mapa (`fitToView` em `useTopologyViewport.ts`), usado
 * quando o painel não tem uma view salva ainda.
 * `null` quando o mapa ou o viewport ainda não têm dimensão válida (ex.: canvas ainda não montado).
 */
export function computeFitToViewTransform(
  mapWidth: number,
  mapHeight: number,
  clientWidth: number,
  clientHeight: number,
  pad = 24
): TopologyView | null {
  if (!mapWidth || !mapHeight || clientWidth <= 0 || clientHeight <= 0) {
    return null;
  }
  const sx = (clientWidth - pad * 2) / mapWidth;
  const sy = (clientHeight - pad * 2) / mapHeight;
  const scale = clamp(Math.min(sx, sy), 0.15, 2);
  return {
    scale,
    x: (clientWidth - mapWidth * scale) / 2,
    y: (clientHeight - mapHeight * scale) / 2,
  };
}
