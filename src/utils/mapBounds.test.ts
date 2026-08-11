import { describe, expect, it } from 'vitest';
import { computeFitToViewTransform, computeTopologyContentBounds } from './mapBounds';

describe('computeFitToViewTransform', () => {
  it('mapa sem width/height (mapa em branco malformado) não quebra — retorna null', () => {
    expect(computeFitToViewTransform(0, 0, 800, 600)).toBeNull();
    expect(computeFitToViewTransform(NaN as unknown as number, 600, 800, 600)).toBeNull();
  });

  it('viewport ainda não montado (0x0) retorna null', () => {
    expect(computeFitToViewTransform(800, 600, 0, 0)).toBeNull();
  });

  it('mapa proporcionalmente menor que o viewport preenche a tela e centraliza', () => {
    const transform = computeFitToViewTransform(400, 400, 800, 600, 0);
    expect(transform).not.toBeNull();
    // sx = 800/400 = 2, sy = 600/400 = 1.5 → usa o menor (sy) para não cortar o mapa.
    expect(transform?.scale).toBeCloseTo(1.5, 5);
    expect(transform?.x).toBeCloseTo(100, 5);
    expect(transform?.y).toBeCloseTo(0, 5);
  });

  it('mapa muito maior que o viewport nunca fica menor que a escala mínima (0.15)', () => {
    const transform = computeFitToViewTransform(20000, 20000, 800, 600);
    expect(transform?.scale).toBeGreaterThanOrEqual(0.15);
  });

  it('mapa minúsculo nunca ultrapassa a escala máxima (2)', () => {
    const transform = computeFitToViewTransform(10, 10, 800, 600);
    expect(transform?.scale).toBeLessThanOrEqual(2);
  });
});

describe('computeTopologyContentBounds', () => {
  it('mapa sem nós usa só as dimensões do JSON (width/height) com a margem padrão', () => {
    const bounds = computeTopologyContentBounds({ width: 800, height: 600, nodes: [], links: [] }, new Map());
    expect(bounds).toEqual({ x0: -48, y0: -48, x1: 848, y1: 648, width: 896, height: 696 });
  });

  it('nó posicionado fora dos limites do JSON expande a área de conteúdo', () => {
    const layouts = new Map([['a', { x: -500, y: -500, w: 100, h: 100 }]]);
    const bounds = computeTopologyContentBounds({ width: 800, height: 600, nodes: [], links: [] }, layouts);
    expect(bounds.x0).toBe(-548);
    expect(bounds.y0).toBe(-548);
  });
});
