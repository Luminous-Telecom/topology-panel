import { TopologyNode } from '../types';
import { NodeLayout } from './nodeLayout';

export interface MarqueeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Converte dois cantos arbitrários em retângulo de largura/altura positivas. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): MarqueeRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Ids dos nós que a caixa de seleção encosta. Basta encostar (não precisa envolver), que é o
 * comportamento esperado de quem arrasta rápido sobre uma fileira de hosts.
 *
 * Caixa de rede só entra quando as redes estão destravadas — senão o usuário selecionaria a região
 * inteira sem querer ao laçar os hosts de dentro dela.
 */
export function nodesInMarquee(
  selection: MarqueeRect,
  nodes: TopologyNode[],
  nodeLayouts: Map<string, NodeLayout & TopologyNode>,
  networksLocked: boolean
): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    const layout = nodeLayouts.get(node.id);
    if (!layout) {
      continue;
    }
    if (node.type === 'network' && networksLocked) {
      continue;
    }
    if (rectsOverlap(selection.x, selection.y, selection.w, selection.h, layout.x, layout.y, layout.w, layout.h)) {
      ids.push(node.id);
    }
  }
  return ids;
}
