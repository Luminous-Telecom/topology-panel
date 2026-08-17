import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { computeGroupPositions, computeGuideBounds, guideReferenceNodes } from './dragMove';
import { DragGroupMember } from './dragState';
import { NodeLayout } from './nodeLayout';

function member(id: string, x: number, y: number): DragGroupMember {
  return { id, startX: x, startY: y, startW: 40, startH: 20 };
}

describe('computeGroupPositions', () => {
  it('mantém a distância entre os nós do grupo', () => {
    const primary = member('a', 100, 100);
    const positions = computeGroupPositions([primary, member('b', 160, 100)], primary, 137, 100, 10);
    expect(positions.b.x - positions.a.x).toBe(60);
    expect(positions.a.y).toBe(positions.b.y);
  });

  it('encaixa o nó arrastado no grid', () => {
    const primary = member('a', 100, 100);
    const positions = computeGroupPositions([primary], primary, 137, 143, 10);
    expect(positions.a).toEqual({ x: 140, y: 140 });
  });

  it('grid de 1px deixa a posição livre', () => {
    const primary = member('a', 100, 100);
    expect(computeGroupPositions([primary], primary, 137, 143, 1)).toEqual({ a: { x: 137, y: 143 } });
  });
});

describe('computeGuideBounds', () => {
  const base = { mapWidth: 800, mapHeight: 600, gridStep: 10 };

  it('sem viewport medido usa só o mapa, com folga de dois passos', () => {
    expect(
      computeGuideBounds({ ...base, view: { x: 0, y: 0, scale: 1 }, viewport: { w: 0, h: 0 } })
    ).toEqual({ x0: -20, y0: -20, x1: 820, y1: 620 });
  });

  it('estende os limites quando a vista passa da borda do mapa', () => {
    const bounds = computeGuideBounds({
      ...base,
      view: { x: -500, y: 0, scale: 1 },
      viewport: { w: 1600, h: 400 },
    });
    expect(bounds.x1).toBe(2120);
    expect(bounds.x0).toBe(-20);
  });

  it('vista rolada para antes do mapa empurra o limite esquerdo', () => {
    const bounds = computeGuideBounds({
      ...base,
      view: { x: 300, y: 0, scale: 1 },
      viewport: { w: 400, h: 400 },
    });
    expect(bounds.x0).toBe(-320);
  });
});

describe('guideReferenceNodes', () => {
  const layouts = new Map<string, NodeLayout & TopologyNode>([
    ['a', { id: 'a', type: 'host', x: 0, y: 0, w: 40, h: 20 } as NodeLayout & TopologyNode],
    ['b', { id: 'b', type: 'host', x: 90, y: 0, w: 40, h: 20 } as NodeLayout & TopologyNode],
  ]);
  const nodes: TopologyNode[] = [
    { id: 'a', type: 'host', x: 0, y: 0 },
    { id: 'b', type: 'host', x: 90, y: 0 },
    { id: 'c', type: 'host', x: 10, y: 10 },
  ];

  it('ignora o nó arrastado e o que ainda não tem layout medido', () => {
    expect(guideReferenceNodes(nodes, new Set(['a']), layouts).map((n) => n.id)).toEqual(['b']);
  });
});
