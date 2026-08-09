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
