import { TopologyMap } from '../../types';

export interface RadialLayoutParams {
  map: TopologyMap;
  nodeIds: string[];
  nodeSizes: Map<string, { width: number; height: number }>;
  gridStep: number;
  originX?: number;
  originY?: number;
}

function buildAdjacency(map: TopologyMap, nodeIds: string[]): Map<string, Set<string>> {
  const ids = new Set(nodeIds);
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    adj.set(id, new Set());
  }
  for (const link of map.links) {
    if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to) {
      continue;
    }
    adj.get(link.from)?.add(link.to);
    adj.get(link.to)?.add(link.from);
  }
  return adj;
}

function pickRoot(nodeIds: string[], adj: Map<string, Set<string>>): string {
  let best = nodeIds[0];
  let bestDegree = -1;
  for (const id of nodeIds) {
    const degree = adj.get(id)?.size ?? 0;
    if (degree > bestDegree) {
      bestDegree = degree;
      best = id;
    }
  }
  return best;
}

/** Layout radial em anéis a partir do nó mais conectado. */
export function computeRadialLayout(params: RadialLayoutParams): Map<string, { x: number; y: number }> {
  const { map, nodeIds, nodeSizes, gridStep, originX = 200, originY = 200 } = params;
  if (!nodeIds.length) {
    return new Map();
  }

  const adj = buildAdjacency(map, nodeIds);
  const root = pickRoot(nodeIds, adj);
  const layers: string[][] = [[root]];
  const visited = new Set<string>([root]);
  let frontier = [root];

  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (visited.has(nb)) {
          continue;
        }
        visited.add(nb);
        next.push(nb);
      }
    }
    if (next.length) {
      layers.push(next);
    }
    frontier = next;
  }

  const orphan = nodeIds.filter((id) => !visited.has(id));
  if (orphan.length) {
    layers.push(orphan);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const baseRadius = Math.max(80, gridStep * 8);

  layers.forEach((ring, ringIdx) => {
    const radius = ringIdx === 0 ? 0 : baseRadius + (ringIdx - 1) * Math.max(100, gridStep * 10);
    const count = ring.length;
    ring.forEach((id, i) => {
      const size = nodeSizes.get(id) ?? { width: 110, height: 56 };
      if (ringIdx === 0) {
        positions.set(id, {
          x: Math.round(originX - size.width / 2),
          y: Math.round(originY - size.height / 2),
        });
        return;
      }
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      const cx = originX + radius * Math.cos(angle);
      const cy = originY + radius * Math.sin(angle);
      positions.set(id, {
        x: Math.round(cx - size.width / 2),
        y: Math.round(cy - size.height / 2),
      });
    });
  });

  return positions;
}
