import { TopologyNode } from '../types';
import { DragPreview } from './dragState';
import { NodeLayout } from './nodeLayout';

export type LayoutMap = Map<string, NodeLayout & TopologyNode>;

/**
 * Aplica o preview de arraste/resize nas caixas já medidas, sem remediar texto.
 *
 * Só as entradas movidas/redimensionadas ganham objeto novo — o resto mantém a identidade, para o
 * `React.memo` das formas pular os nós que não estão no gesto.
 */
export function applyDragPreviewToLayouts(layouts: LayoutMap, preview: DragPreview): LayoutMap {
  if (!preview) {
    return layouts;
  }

  const movePositions = preview.positions;
  const hasMove = Boolean(movePositions && Object.keys(movePositions).length > 0);
  const resizeId = preview.nodeId;
  const resizeW = preview.width;
  const resizeH = preview.height;
  const hasResize = resizeId !== undefined && resizeW !== undefined && resizeH !== undefined;

  if (!hasMove && !hasResize) {
    return layouts;
  }

  const next = new Map(layouts);

  if (hasMove && movePositions) {
    for (const [id, pos] of Object.entries(movePositions)) {
      const layout = next.get(id);
      if (layout) {
        next.set(id, { ...layout, x: pos.x, y: pos.y });
      }
    }
  }

  if (hasResize && resizeId !== undefined) {
    const layout = next.get(resizeId);
    if (layout) {
      next.set(resizeId, { ...layout, width: resizeW, height: resizeH, w: resizeW, h: resizeH });
    }
  }

  return next;
}
