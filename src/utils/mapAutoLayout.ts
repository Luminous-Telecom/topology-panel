import { TopologyMap, TopologyNode } from '../types';
import { snapNodeCenterToGrid } from './mapCoords';
import { moveStoredNodesBulk } from './mapEdits';

const DEFAULT_HOST_W = 100;
const DEFAULT_HOST_H = 72;
const DEFAULT_SUBMAP_W = 140;
const DEFAULT_SUBMAP_H = 56;
const DEFAULT_STATIC_W = 120;
const DEFAULT_STATIC_H = 40;
const DEFAULT_NETWORK_W = 350;
const DEFAULT_NETWORK_H = 250;
const LAYOUT_PADDING = 40;

export interface ElkLayoutNodeSize {
  width: number;
  height: number;
}

/** Dimensões aproximadas para o motor de layout (host, rede, submapa, etc.). */
export function layoutNodeSize(node: TopologyNode): ElkLayoutNodeSize {
  if (node.type === 'network') {
    return {
      width: Math.max(80, node.width ?? DEFAULT_NETWORK_W),
      height: Math.max(60, node.height ?? DEFAULT_NETWORK_H),
    };
  }
  if (node.type === 'submap' || node.type === 'dashboard_picker') {
    return {
      width: Math.max(80, node.width ?? DEFAULT_SUBMAP_W),
      height: Math.max(40, node.height ?? DEFAULT_SUBMAP_H),
    };
  }
  if (node.type === 'static') {
    return {
      width: Math.max(60, node.width ?? DEFAULT_STATIC_W),
      height: Math.max(24, node.height ?? DEFAULT_STATIC_H),
    };
  }
  return { width: DEFAULT_HOST_W, height: DEFAULT_HOST_H };
}

interface ElkLayoutInput {
  id: string;
  width: number;
  height: number;
}

interface ElkLayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
}

/**
 * Organiza nós com ELK (layout em camadas). Posições passam pelo snap da grade.
 * Links só orientam o grafo — waypoints existentes não são alterados aqui.
 */
export async function autoLayoutTopologyMap(map: TopologyMap, gridSize: number): Promise<TopologyMap> {
  if (!Array.isArray(map.nodes) || map.nodes.length === 0) {
    return map;
  }

  const sizes = new Map<string, ElkLayoutNodeSize>();
  const children: ElkLayoutInput[] = map.nodes.map((node) => {
    const size = layoutNodeSize(node);
    sizes.set(node.id, size);
    return { id: node.id, width: size.width, height: size.height };
  });

  const edges: ElkLayoutEdge[] = map.links.map((link, idx) => ({
    id: `link-${idx}-${link.from}-${link.to}`,
    sources: [link.from],
    targets: [link.to],
  }));

  const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
  const elk = new ELK();

  const layout = await elk.layout({
    id: 'topology-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.padding': `[top=${LAYOUT_PADDING},left=${LAYOUT_PADDING},bottom=${LAYOUT_PADDING},right=${LAYOUT_PADDING}]`,
    },
    children,
    edges,
  });

  const positioned = layout.children ?? [];
  const moves: Array<{ nodeId: string; x: number; y: number }> = [];

  for (const box of positioned) {
    if (box.x == null || box.y == null) {
      continue;
    }
    const size = sizes.get(box.id);
    if (!size) {
      continue;
    }
    const snapped = snapNodeCenterToGrid(box.x, box.y, size.width, size.height, gridSize);
    moves.push({ nodeId: box.id, x: snapped.x, y: snapped.y });
  }

  if (moves.length === 0) {
    return map;
  }

  return moveStoredNodesBulk(map, moves);
}
