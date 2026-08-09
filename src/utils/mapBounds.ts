import { TopologyMap, TopologyNode } from '../types';

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

export function layoutCenter(layout: LayoutBox): { x: number; y: number } {
  return { x: layout.x + layout.w / 2, y: layout.y + layout.h / 2 };
}

export function isNetworkNode(node: TopologyNode): boolean {
  return node.type === 'network';
}

export function pointInLayoutBox(px: number, py: number, layout: LayoutBox): boolean {
  return px >= layout.x && px <= layout.x + layout.w && py >= layout.y && py <= layout.y + layout.h;
}

/** Rede cujo retângulo contém o ponto (ordem inversa — rede “por cima” vence). */
export function findNetworkAtMapPoint(
  mapX: number,
  mapY: number,
  nodes: TopologyNode[],
  nodeLayouts: Map<string, LayoutBox>
): TopologyNode | undefined {
  const networks = nodes.filter(isNetworkNode);
  for (let i = networks.length - 1; i >= 0; i -= 1) {
    const node = networks[i];
    const layout = nodeLayouts.get(node.id);
    if (layout && pointInLayoutBox(mapX, mapY, layout)) {
      return node;
    }
  }
  return undefined;
}
