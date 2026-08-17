import dagre from 'dagre';
import { TopologyMap } from '../../types';

export type HierarchicalRankDir = 'TB' | 'BT' | 'LR' | 'RL';

export interface DagreLayoutParams {
  map: TopologyMap;
  nodeIds: string[];
  rankdir: HierarchicalRankDir;
  nodeSizes: Map<string, { width: number; height: number }>;
  gridStep: number;
}

/** Layout hierárquico via Dagre — adequado para topologias ISP (core → POP → access). */
export function computeDagreLayout(params: DagreLayoutParams): Map<string, { x: number; y: number }> {
  const { map, nodeIds, rankdir, nodeSizes, gridStep } = params;
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep: Math.max(40, gridStep * 4),
    ranksep: Math.max(60, gridStep * 6),
    marginx: gridStep * 2,
    marginy: gridStep * 2,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const idSet = new Set(nodeIds);
  for (const id of nodeIds) {
    const size = nodeSizes.get(id) ?? { width: 110, height: 56 };
    g.setNode(id, { width: size.width, height: size.height });
  }

  for (const link of map.links) {
    if (idSet.has(link.from) && idSet.has(link.to) && link.from !== link.to) {
      g.setEdge(link.from, link.to);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const id of nodeIds) {
    const laid = g.node(id);
    if (!laid) {
      continue;
    }
    positions.set(id, {
      x: Math.round(laid.x - laid.width / 2),
      y: Math.round(laid.y - laid.height / 2),
    });
  }
  return positions;
}
