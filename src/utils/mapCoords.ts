export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Round coordinate to nearest grid line. */
export function snapToGrid(n: number, step: number): number {
  if (step <= 0) {
    return Math.round(n);
  }
  return Math.round(n / step) * step;
}

/** Snap node position so its center aligns to the grid (keeps vertical links straight). */
export function snapNodeCenterToGrid(
  x: number,
  y: number,
  w: number,
  h: number,
  step: number
): { x: number; y: number } {
  if (step <= 0) {
    return { x: Math.round(x), y: Math.round(y) };
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    x: snapToGrid(cx, step) - w / 2,
    y: snapToGrid(cy, step) - h / 2,
  };
}

export function clientToMapCoords(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  view: { x: number; y: number; scale: number }
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - view.x) / view.scale,
    y: (clientY - rect.top - view.y) / view.scale,
  };
}
