export interface GridLayoutParams {
  nodeIds: string[];
  nodeSizes: Map<string, { width: number; height: number }>;
  gridStep: number;
  startX?: number;
  startY?: number;
  columns?: number;
}

/** Grade uniforme — útil para mapas sem links ou como fallback. */
export function computeGridLayout(params: GridLayoutParams): Map<string, { x: number; y: number }> {
  const { nodeIds, nodeSizes, gridStep, startX = 80, startY = 80 } = params;
  const columns = params.columns ?? Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
  const gapX = gridStep * 14;
  const gapY = gridStep * 10;
  const positions = new Map<string, { x: number; y: number }>();

  let col = 0;
  let row = 0;
  let rowHeight = 0;

  for (const id of nodeIds) {
    const size = nodeSizes.get(id) ?? { width: 110, height: 56 };
    const x = startX + col * gapX;
    const y = startY + row * gapY;
    positions.set(id, { x, y });
    rowHeight = Math.max(rowHeight, size.height);
    col += 1;
    if (col >= columns) {
      col = 0;
      row += 1;
    }
  }

  return positions;
}
