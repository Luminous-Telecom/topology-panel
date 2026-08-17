import { describe, expect, it } from 'vitest';
import { MAX_SCALE, MIN_SCALE, pinchZoom, wheelZoom, zoomAtPoint } from './zoomMath';

const view = { x: 0, y: 0, scale: 1 };

describe('zoomAtPoint', () => {
  it('mantém parado o ponto sob o cursor', () => {
    const next = zoomAtPoint(view, 100, 50, 2);
    // Ponto do mapa sob o cursor antes: (100, 50). Depois do zoom precisa continuar lá.
    expect((100 - next.x) / next.scale).toBeCloseTo(100);
    expect((50 - next.y) / next.scale).toBeCloseTo(50);
  });

  it('respeita os limites de escala', () => {
    expect(zoomAtPoint(view, 0, 0, 99).scale).toBe(MAX_SCALE);
    expect(zoomAtPoint(view, 0, 0, 0.001).scale).toBe(MIN_SCALE);
  });
});

describe('wheelZoom', () => {
  it('roda para cima aproxima e para baixo afasta', () => {
    expect(wheelZoom(view, 0, 0, -1).scale).toBeCloseTo(1.1);
    expect(wheelZoom(view, 0, 0, 1).scale).toBeCloseTo(0.9);
  });
});

describe('pinchZoom', () => {
  const start = { dist: 100, midX: 200, midY: 100, view };

  it('dobrar a distância dos dedos dobra a escala', () => {
    expect(pinchZoom(start, 200, 200, 100).scale).toBeCloseTo(2);
  });

  it('mover os dedos sem mudar a distância arrasta o mapa', () => {
    const next = pinchZoom(start, 100, 240, 130);
    expect(next.scale).toBeCloseTo(1);
    expect(next.x).toBeCloseTo(40);
    expect(next.y).toBeCloseTo(30);
  });
});
