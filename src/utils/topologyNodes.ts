import { TopologyNode } from '../types';

/** Nó do tipo host — inclui nós legados sem `type` (default é 'host'). */
export function isHostNode(node: TopologyNode): boolean {
  return (node.type ?? 'host') === 'host';
}

export function isSubmapNode(node: TopologyNode): boolean {
  return node.type === 'submap';
}

/** Submapa com mapa interno (`submapChildMapId`) configurado. */
export function submapHasChildMapId(node: TopologyNode): boolean {
  return isSubmapNode(node) && Boolean(node.submapChildMapId?.trim());
}

export function findNodeById(nodes: TopologyNode[], id: string): TopologyNode | undefined {
  return nodes.find((n) => n.id === id);
}
