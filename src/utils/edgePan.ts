export interface EdgeScrollDelta {
  scrollX: number;
  scrollY: number;
}

/**
 * Deslocamento de pan da view ao arrastar nó/rede contra a borda.
 * Mesma direção do arraste: puxar o host para a direita → mapa vai para a direita.
 */
export function computeEdgeScrollDelta(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  margin: number,
  maxSpeed: number
): EdgeScrollDelta {
  if (margin <= 0 || maxSpeed <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { scrollX: 0, scrollY: 0 };
  }

  let scrollX = 0;
  let scrollY = 0;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const distRight = rect.width - localX;
  const distBottom = rect.height - localY;

  if (distRight < margin) {
    scrollX = ((margin - distRight) / margin) * maxSpeed;
  } else if (localX < margin) {
    scrollX = -((margin - localX) / margin) * maxSpeed;
  }

  if (distBottom < margin) {
    scrollY = ((margin - distBottom) / margin) * maxSpeed;
  } else if (localY < margin) {
    scrollY = -((margin - localY) / margin) * maxSpeed;
  }

  return { scrollX, scrollY };
}
