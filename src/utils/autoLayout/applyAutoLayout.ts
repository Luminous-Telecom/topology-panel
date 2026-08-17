import { TopologyMap, TopologyNode } from '../../types';
import { snapToGrid } from '../mapCoords';
import { computeDagreLayout } from './dagreLayout';
import { computeGridLayout } from './gridLayout';
import { isAutoLayoutNode, isNodePositionManual, nodeLayoutSize } from './nodeSize';
import { computeRadialLayout } from './radialLayout';
import { AutoLayoutApplyOptions, AutoLayoutApplyResult } from './types';

function buildNodeSizes(nodes: TopologyNode[]): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    sizes.set(node.id, nodeLayoutSize(node));
  }
  return sizes;
}

function selectTargetNodes(map: TopologyMap, includeManual: boolean): TopologyNode[] {
  return map.nodes.filter((node) => {
    if (!isAutoLayoutNode(node)) {
      return false;
    }
    if (!includeManual && isNodePositionManual(node)) {
      return false;
    }
    return true;
  });
}

function countSkippedManual(map: TopologyMap): number {
  return map.nodes.filter((node) => isAutoLayoutNode(node) && isNodePositionManual(node)).length;
}

function normalizePositions(
  positions: Map<string, { x: number; y: number }>,
  margin: number
): Map<string, { x: number; y: number }> {
  if (!positions.size) {
    return positions;
  }
  let minX = Infinity;
  let minY = Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
  }
  const dx = margin - minX;
  const dy = margin - minY;
  if (dx === 0 && dy === 0) {
    return positions;
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of positions) {
    out.set(id, { x: pos.x + dx, y: pos.y + dy });
  }
  return out;
}

function snapPositions(
  positions: Map<string, { x: number; y: number }>,
  gridStep: number
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, pos] of positions) {
    out.set(id, {
      x: snapToGrid(pos.x, gridStep),
      y: snapToGrid(pos.y, gridStep),
    });
  }
  return out;
}

function computeLayoutPositions(
  map: TopologyMap,
  targetNodes: TopologyNode[],
  options: AutoLayoutApplyOptions
): Map<string, { x: number; y: number }> {
  const nodeIds = targetNodes.map((n) => n.id);
  const nodeSizes = buildNodeSizes(targetNodes);
  const margin = options.contentMargin ?? 80;
  const gridStep = options.gridStep;

  let positions: Map<string, { x: number; y: number }>;

  switch (options.mode) {
    case 'hierarchical-down':
      positions = computeDagreLayout({
        map,
        nodeIds,
        rankdir: 'TB',
        nodeSizes,
        gridStep,
      });
      break;
    case 'hierarchical-up':
      positions = computeDagreLayout({
        map,
        nodeIds,
        rankdir: 'BT',
        nodeSizes,
        gridStep,
      });
      break;
    case 'hierarchical-right':
      positions = computeDagreLayout({
        map,
        nodeIds,
        rankdir: 'LR',
        nodeSizes,
        gridStep,
      });
      break;
    case 'hierarchical-left':
      positions = computeDagreLayout({
        map,
        nodeIds,
        rankdir: 'RL',
        nodeSizes,
        gridStep,
      });
      break;
    case 'radial':
      positions = computeRadialLayout({
        map,
        nodeIds,
        nodeSizes,
        gridStep,
        originX: margin + 200,
        originY: margin + 200,
      });
      break;
    case 'grid':
      positions = computeGridLayout({
        nodeIds,
        nodeSizes,
        gridStep,
        startX: margin,
        startY: margin,
      });
      break;
    default: {
      const _exhaustive: never = options.mode;
      return _exhaustive;
    }
  }

  positions = normalizePositions(positions, margin);
  if (options.snapToGrid !== false) {
    positions = snapPositions(positions, gridStep);
  }
  return positions;
}

function expandMapToFit(map: TopologyMap, nodes: TopologyNode[], padding: number): TopologyMap {
  let maxX = map.width;
  let maxY = map.height;
  for (const node of nodes) {
    const { width, height } = nodeLayoutSize(node);
    maxX = Math.max(maxX, node.x + width + padding);
    maxY = Math.max(maxY, node.y + height + padding);
  }
  if (maxX === map.width && maxY === map.height) {
    return map;
  }
  return { ...map, width: maxX, height: maxY };
}

/** Calcula posições sem alterar o mapa — útil para testes. */
export function previewAutoLayoutPositions(
  map: TopologyMap,
  options: AutoLayoutApplyOptions
): Map<string, { x: number; y: number }> {
  const targets = selectTargetNodes(map, options.includeManualPositions);
  if (!targets.length) {
    return new Map();
  }
  return computeLayoutPositions(map, targets, options);
}

/** Aplica auto-layout aos nós elegíveis e devolve mapa atualizado. */
export function applyAutoLayout(
  map: TopologyMap,
  options: AutoLayoutApplyOptions
): { map: TopologyMap; result: AutoLayoutApplyResult } {
  const skippedManualCount = options.includeManualPositions ? 0 : countSkippedManual(map);
  const targets = selectTargetNodes(map, options.includeManualPositions);
  if (!targets.length) {
    return {
      map,
      result: { movedCount: 0, skippedManualCount },
    };
  }

  const positions = computeLayoutPositions(map, targets, options);
  const targetIds = new Set(targets.map((n) => n.id));

  const nodes = map.nodes.map((node) => {
    if (!targetIds.has(node.id)) {
      return node;
    }
    const pos = positions.get(node.id);
    if (!pos) {
      return node;
    }
    return {
      ...node,
      x: pos.x,
      y: pos.y,
      positionMode: 'auto' as const,
      networkId: node.type === 'host' ? undefined : node.networkId,
    };
  });

  let next: TopologyMap = { ...map, nodes };
  next = expandMapToFit(next, nodes, options.contentMargin ?? 80);

  return {
    map: next,
    result: {
      movedCount: targets.length,
      skippedManualCount,
    },
  };
}

export function countManualLayoutNodes(map: TopologyMap): number {
  return countSkippedManual(map);
}

export function countAutoLayoutEligibleNodes(map: TopologyMap): number {
  return map.nodes.filter((node) => isAutoLayoutNode(node)).length;
}
