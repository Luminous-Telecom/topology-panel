/** Tamanho de nó para cálculo de layout (caixa de colisão). */
import { TopologyNode } from '../../types';

export function nodeLayoutSize(node: TopologyNode): { width: number; height: number } {
  if (node.type === 'network') {
    return { width: node.width ?? 220, height: node.height ?? 140 };
  }
  if (node.type === 'static') {
    return { width: node.width ?? 200, height: node.height ?? 80 };
  }
  if (node.type === 'dashboard_picker') {
    return { width: node.width ?? 140, height: node.height ?? 56 };
  }
  if (node.type === 'submap') {
    return { width: node.width ?? 120, height: node.height ?? 64 };
  }
  return { width: node.width ?? 110, height: node.height ?? 56 };
}

/** Nós que participam do auto-layout de topologia (hosts e submapas). */
export function isAutoLayoutNode(node: TopologyNode): boolean {
  return (
    node.type === 'host' ||
    node.type === 'submap' ||
    node.type === 'dashboard_picker' ||
    node.type === undefined
  );
}

export function isNodePositionManual(node: TopologyNode): boolean {
  return node.positionMode !== 'auto';
}
