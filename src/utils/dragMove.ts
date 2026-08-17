import { TopologyNode } from '../types';
import { AlignGuideNode } from './alignGuides';
import { DragGroupMember } from './dragState';
import { snapNodeCenterToGrid } from './mapCoords';
import { NodeLayout } from './nodeLayout';

/**
 * Posições finais do grupo arrastado.
 *
 * O nó sob o cursor manda: ele é encaixado no grid primeiro e todos os outros andam o mesmo delta,
 * cada um encaixado no grid depois — assim o grupo não se deforma e nada fica fora da grade.
 */
export function computeGroupPositions(
  members: DragGroupMember[],
  primary: DragGroupMember,
  rawPrimaryX: number,
  rawPrimaryY: number,
  gridStep: number
): Record<string, { x: number; y: number }> {
  const snappedPrimary = snapNodeCenterToGrid(
    rawPrimaryX,
    rawPrimaryY,
    primary.startW,
    primary.startH,
    gridStep
  );
  const dx = snappedPrimary.x - primary.startX;
  const dy = snappedPrimary.y - primary.startY;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const member of members) {
    positions[member.id] = snapNodeCenterToGrid(
      member.startX + dx,
      member.startY + dy,
      member.startW,
      member.startH,
      gridStep
    );
  }
  return positions;
}

export interface GuideBoundsParams {
  mapWidth: number;
  mapHeight: number;
  view: { x: number; y: number; scale: number };
  viewport: { w: number; h: number };
  gridStep: number;
}

/**
 * Retângulo onde as linhas-guia podem ser desenhadas: o mapa somado à área visível (o usuário pode
 * ter rolado para fora do mapa), arredondado para fora no passo do grid.
 */
export function computeGuideBounds({
  mapWidth,
  mapHeight,
  view,
  viewport,
  gridStep,
}: GuideBoundsParams): { x0: number; y0: number; x1: number; y1: number } {
  const pad = gridStep * 2;
  let x0 = 0;
  let y0 = 0;
  let x1 = mapWidth;
  let y1 = mapHeight;
  if (viewport.w > 0 && viewport.h > 0 && view.scale > 0) {
    x0 = Math.min(x0, -view.x / view.scale);
    y0 = Math.min(y0, -view.y / view.scale);
    x1 = Math.max(x1, (viewport.w - view.x) / view.scale);
    y1 = Math.max(y1, (viewport.h - view.y) / view.scale);
  }
  return {
    x0: Math.floor((x0 - pad) / gridStep) * gridStep,
    y0: Math.floor((y0 - pad) / gridStep) * gridStep,
    x1: Math.ceil((x1 + pad) / gridStep) * gridStep,
    y1: Math.ceil((y1 + pad) / gridStep) * gridStep,
  };
}

/** Nós que servem de referência para as guias: todos os que não estão sendo arrastados. */
export function guideReferenceNodes(
  nodes: TopologyNode[],
  draggedIds: Set<string>,
  nodeLayouts: Map<string, NodeLayout & TopologyNode>
): AlignGuideNode[] {
  const others: AlignGuideNode[] = [];
  for (const node of nodes) {
    if (draggedIds.has(node.id)) {
      continue;
    }
    const layout = nodeLayouts.get(node.id);
    if (!layout) {
      continue;
    }
    others.push({ id: node.id, x: layout.x, y: layout.y, w: layout.w, h: layout.h, type: node.type });
  }
  return others;
}
