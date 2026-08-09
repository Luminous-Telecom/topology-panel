export interface EdgePanVelocity {
  vx: number;
  vy: number;
}

type EdgePanRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function edgeAxisVelocity(
  pointer: number,
  min: number,
  max: number,
  threshold: number,
  maxSpeed: number
): number {
  if (threshold <= 0 || maxSpeed <= 0 || max <= min) {
    return 0;
  }

  if (pointer < min + threshold) {
    const t = clamp((min + threshold - pointer) / threshold, 0, 1);
    return maxSpeed * t * t;
  }

  if (pointer > max - threshold) {
    const t = clamp((pointer - (max - threshold)) / threshold, 0, 1);
    return -maxSpeed * t * t;
  }

  return 0;
}

/** Velocidade de auto-pan (px/s). Borda direita → conteúdo desloca para a esquerda. */
export function computeEdgePanVelocity(
  clientX: number,
  clientY: number,
  rect: EdgePanRect,
  threshold: number,
  maxSpeed: number
): EdgePanVelocity {
  if (threshold <= 0 || maxSpeed <= 0 || rect.width <= 0 || rect.height <= 0) {
    return { vx: 0, vy: 0 };
  }

  return {
    vx: edgeAxisVelocity(clientX, rect.left, rect.right, threshold, maxSpeed),
    vy: edgeAxisVelocity(clientY, rect.top, rect.bottom, threshold, maxSpeed),
  };
}

/** Expõe eixo para testes unitários. */
export function edgeAxisVelocityForTest(
  pointer: number,
  min: number,
  max: number,
  threshold: number,
  maxSpeed: number
): number {
  return edgeAxisVelocity(pointer, min, max, threshold, maxSpeed);
}
