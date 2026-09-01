import { describe, expect, it } from 'vitest';
import { computeLinkGeometry, linkTrafficAnchor, parallelLinkBundleOffset, pointAlongPolyline, polylineLength, sameLinkPoints } from './linkGeometry';
import { TopologyLink } from '../types';

describe('polylineLength', () => {
  it('soma os segmentos de uma polilinha com cotovelo', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])).toBe(70);
  });

  it('ponto único não tem comprimento', () => {
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('computeLinkGeometry', () => {
  it('sai da borda do origin e chega na borda do destino', () => {
    const from = { x: 0, y: 0, w: 40, h: 20 };
    const to = { x: 100, y: 0, w: 40, h: 20 };
    const geom = computeLinkGeometry(from, to, 10);
    expect(geom.start).toEqual({ x: 40, y: 10 });
    expect(geom.end).toEqual({ x: 100, y: 10 });
  });

  it('liga as bordas de cima e de baixo quando os nós estão na vertical', () => {
    const from = { x: 0, y: 0, w: 40, h: 20 };
    const to = { x: 0, y: 100, w: 40, h: 20 };
    const geom = computeLinkGeometry(from, to, 10);
    expect(geom.start).toEqual({ x: 20, y: 20 });
    expect(geom.end).toEqual({ x: 20, y: 100 });
  });
});

describe('pointAlongPolyline', () => {
  it('devolve o ponto no meio de um segmento horizontal', () => {
    const p = pointAlongPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0.5);
    expect(p.x).toBe(50);
    expect(p.y).toBe(0);
  });

  it('respeita a fração em uma polilinha com cotovelo', () => {
    const p = pointAlongPolyline([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 60 }], 0.5);
    expect(p.x).toBe(40);
    expect(p.y).toBe(10);
  });

  it('lista vazia devolve a origem', () => {
    expect(pointAlongPolyline([], 0.5)).toEqual({ x: 0, y: 0, angle: 0 });
  });
});

describe('sameLinkPoints', () => {
  it('compara coordenadas ponto a ponto', () => {
    expect(sameLinkPoints([{ x: 1, y: 2 }], [{ x: 1, y: 2 }])).toBe(true);
    expect(sameLinkPoints([{ x: 1, y: 2 }], [{ x: 1, y: 3 }])).toBe(false);
  });
});

describe('linkTrafficAnchor', () => {
  it('ancora a pílula no meio do cabo reto', () => {
    const from = { x: 0, y: 0, w: 40, h: 20 };
    const to = { x: 100, y: 0, w: 40, h: 20 };
    const p = linkTrafficAnchor(from, to, 10);
    expect(p.x).toBe(70);
    expect(p.y).toBe(10);
  });
});

describe('parallelLinkBundleOffset', () => {
  it('um cabo sozinho fica na linha original', () => {
    const link: TopologyLink = { from: 'a', to: 'b' };
    expect(parallelLinkBundleOffset(link, [link])).toBe(0);
  });

  it('dois cabos entre o mesmo par saem simétricos', () => {
    const first: TopologyLink = { from: 'a', to: 'b', fromInterface: { name: 'eth-a' } };
    const second: TopologyLink = { from: 'a', to: 'b', fromInterface: { name: 'eth-c' } };
    const links = [first, second];
    const a = parallelLinkBundleOffset(first, links);
    const b = parallelLinkBundleOffset(second, links);
    expect(a).toBe(-b);
    expect(Math.abs(a)).toBe(6);
  });
});
