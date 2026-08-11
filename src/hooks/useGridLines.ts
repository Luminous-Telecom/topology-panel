import { useCallback, useMemo } from 'react';
import { TopologyView } from '../types';

interface UseGridLinesParams {
  gridStep: number;
  mapWidth: number;
  mapHeight: number;
  view: TopologyView;
  viewport: { w: number; h: number };
}

interface GridBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Extensão da grade em coords do mapa — cresce com tamanho do painel, pan e zoom. */
export function useGridLines({ gridStep, mapWidth, mapHeight, view, viewport }: UseGridLinesParams): {
  gridBounds: GridBounds;
  gridVerticalLines: number[];
  gridHorizontalLines: number[];
  isMajorGridLine: (coord: number) => boolean;
  majorGridEvery: number;
} {
  const majorGridEvery = gridStep <= 12 ? 5 : 4;

  const gridBounds = useMemo(() => {
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
  }, [gridStep, mapWidth, mapHeight, view.scale, view.x, view.y, viewport.h, viewport.w]);

  const gridVerticalLines = useMemo(() => {
    const start = Math.floor(gridBounds.x0 / gridStep);
    const end = Math.ceil(gridBounds.x1 / gridStep);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i) * gridStep);
  }, [gridBounds.x0, gridBounds.x1, gridStep]);

  const gridHorizontalLines = useMemo(() => {
    const start = Math.floor(gridBounds.y0 / gridStep);
    const end = Math.ceil(gridBounds.y1 / gridStep);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i) * gridStep);
  }, [gridBounds.y0, gridBounds.y1, gridStep]);

  const isMajorGridLine = useCallback(
    (coord: number) => {
      const idx = Math.round(coord / gridStep);
      return ((idx % majorGridEvery) + majorGridEvery) % majorGridEvery === 0;
    },
    [gridStep, majorGridEvery]
  );

  return { gridBounds, gridVerticalLines, gridHorizontalLines, isMajorGridLine, majorGridEvery };
}
