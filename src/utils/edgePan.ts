export interface EdgePanVelocity {
  vx: number;
  vy: number;
}

/** Velocidade de pan (px de tela por frame) quando o ponteiro está na faixa de borda. */
export function computeEdgePanVelocity(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  margin: number,
  maxSpeed: number
): EdgePanVelocity {
  if (margin <= 0 || maxSpeed <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { vx: 0, vy: 0 };
  }

  let vx = 0;
  let vy = 0;
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const distRight = rect.width - localX;
  const distBottom = rect.height - localY;

  if (localX < margin) {
    vx = -((margin - localX) / margin) * maxSpeed;
  } else if (distRight < margin) {
    vx = ((margin - distRight) / margin) * maxSpeed;
  }

  if (localY < margin) {
    vy = -((margin - localY) / margin) * maxSpeed;
  } else if (distBottom < margin) {
    vy = ((margin - distBottom) / margin) * maxSpeed;
  }

  return { vx, vy };
}
