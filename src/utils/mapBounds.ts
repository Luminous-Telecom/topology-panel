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
