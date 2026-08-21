import { describe, expect, it } from 'vitest';
import {
  boxIntersectsRect,
  CULL_TILE,
  linkBoundingBox,
  visibleWorldRect,
  WorldRect,
} from './viewportCulling';

const VIEWPORT = { w: 1000, h: 800 };

describe('visibleWorldRect', () => {
  it('cobre a viewport inteira em zoom 1 sem deslocamento', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, scale: 1 }, VIEWPORT, 0, 1);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 800 });
  });

  it('converte tela para mundo dividindo pela escala', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, scale: 2 }, VIEWPORT, 0, 1);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: 500, y1: 400 });
  });

  it('desloca no sentido oposto ao pan', () => {
    const rect = visibleWorldRect({ x: -300, y: -200, scale: 1 }, VIEWPORT, 0, 1);
    expect(rect).toEqual({ x0: 300, y0: 200, x1: 1300, y1: 1000 });
  });

  it('escala não positiva não divide por zero', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, scale: 0 }, VIEWPORT, 0, 1);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 800 });
  });

  it('a margem expande o retângulo nos quatro lados', () => {
    const rect = visibleWorldRect({ x: 0, y: 0, scale: 1 }, VIEWPORT, 100, 1);
    expect(rect).toEqual({ x0: -100, y0: -100, x1: 1100, y1: 900 });
  });

  it('alinha à grade: para fora, nunca para dentro', () => {
    const rect = visibleWorldRect({ x: -10, y: -10, scale: 1 }, VIEWPORT, 0, 512);
    expect(rect.x0).toBe(0);
    expect(rect.y0).toBe(0);
    // x1 = 1000 + 10 = 1010 e y1 = 800 + 10 = 810; os dois sobem para o múltiplo 1024.
    expect(rect.x1).toBe(1024);
    expect(rect.y1).toBe(1024);
  });

  it('pan menor que a grade não muda o retângulo — é isso que mantém o pan sem re-render', () => {
    const base = visibleWorldRect({ x: -600, y: -600, scale: 1 }, VIEWPORT);
    const nudged = visibleWorldRect({ x: -601, y: -603, scale: 1 }, VIEWPORT);
    expect(nudged).toEqual(base);
  });

  it('pan maior que a grade muda o retângulo', () => {
    const base = visibleWorldRect({ x: -600, y: -600, scale: 1 }, VIEWPORT);
    const far = visibleWorldRect({ x: -600 - CULL_TILE * 2, y: -600, scale: 1 }, VIEWPORT);
    expect(far).not.toEqual(base);
  });
});

describe('boxIntersectsRect', () => {
  const rect: WorldRect = { x0: 0, y0: 0, x1: 100, y1: 100 };

  it('caixa dentro do retângulo é visível', () => {
    expect(boxIntersectsRect({ x: 10, y: 10, w: 20, h: 20 }, rect)).toBe(true);
  });

  it('caixa totalmente fora não é visível', () => {
    expect(boxIntersectsRect({ x: 200, y: 10, w: 20, h: 20 }, rect)).toBe(false);
    expect(boxIntersectsRect({ x: 10, y: -200, w: 20, h: 20 }, rect)).toBe(false);
  });

  it('caixa que só cruza a borda continua visível', () => {
    expect(boxIntersectsRect({ x: -10, y: 10, w: 20, h: 20 }, rect)).toBe(true);
  });

  it('caixa maior que o retângulo, que o engloba, é visível', () => {
    expect(boxIntersectsRect({ x: -500, y: -500, w: 2000, h: 2000 }, rect)).toBe(true);
  });

  it('caixa com coordenada não finita continua visível em vez de sumir do mapa', () => {
    expect(boxIntersectsRect({ x: Number.NaN, y: 10, w: 20, h: 20 }, rect)).toBe(true);
    expect(boxIntersectsRect({ x: 10, y: 10, w: Number.POSITIVE_INFINITY, h: 20 }, rect)).toBe(true);
  });
});

describe('linkBoundingBox', () => {
  it('envolve as duas pontas', () => {
    const box = linkBoundingBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 50, w: 10, h: 10 }, []);
    expect(box).toEqual({ x: 0, y: 0, w: 110, h: 60 });
  });

  it('inclui os waypoints, que podem sair da caixa das pontas', () => {
    const box = linkBoundingBox(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 100, y: 0, w: 10, h: 10 },
      [{ x: 50, y: 900 }]
    );
    expect(box).toEqual({ x: 0, y: 0, w: 110, h: 900 });
  });

  it('cabo longo entre dois nós fora da tela continua visível quando cruza a viewport', () => {
    const rect: WorldRect = { x0: 0, y0: 0, x1: 100, y1: 100 };
    const box = linkBoundingBox({ x: -500, y: 50, w: 10, h: 10 }, { x: 600, y: 50, w: 10, h: 10 }, []);
    expect(box).toBeDefined();
    if (box) {
      expect(boxIntersectsRect(box, rect)).toBe(true);
    }
  });

  it('sem ponta medida e sem waypoint não há caixa', () => {
    expect(linkBoundingBox(undefined, undefined, [])).toBeUndefined();
  });
});
