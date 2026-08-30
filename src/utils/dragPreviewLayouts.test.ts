import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { applyDragPreviewToLayouts, dragPreviewCaughtUp, LayoutMap } from './dragPreviewLayouts';
import { NodeLayout } from './nodeLayout';

function box(id: string, x: number, y: number): NodeLayout & TopologyNode {
  return {
    id,
    type: 'host',
    x,
    y,
    w: 40,
    h: 24,
    label: id,
    sub: '',
    labelFontSize: 11,
    subFontSize: 9,
    labelY: 12,
  };
}

function layoutsOf(...nodes: Array<NodeLayout & TopologyNode>): LayoutMap {
  return new Map(nodes.map((n) => [n.id, n]));
}

describe('applyDragPreviewToLayouts', () => {
  it('devolve o mesmo Map quando não há preview', () => {
    const layouts = layoutsOf(box('a', 0, 0));
    expect(applyDragPreviewToLayouts(layouts, null)).toBe(layouts);
  });

  it('só troca a identidade da caixa movida', () => {
    const a = box('a', 0, 0);
    const b = box('b', 80, 0);
    const layouts = layoutsOf(a, b);
    const next = applyDragPreviewToLayouts(layouts, { positions: { a: { x: 10, y: 20 } } });

    expect(next).not.toBe(layouts);
    expect(next.get('a')).toEqual({ ...a, x: 10, y: 20 });
    expect(next.get('b')).toBe(b);
  });

  it('atualiza largura e altura no resize sem mexer nos outros', () => {
    const a = box('a', 0, 0);
    const b = box('b', 80, 0);
    const layouts = layoutsOf(a, b);
    const next = applyDragPreviewToLayouts(layouts, { nodeId: 'a', width: 120, height: 60 });

    expect(next.get('a')?.w).toBe(120);
    expect(next.get('a')?.h).toBe(60);
    expect(next.get('b')).toBe(b);
  });
});

describe('dragPreviewCaughtUp', () => {
  it('preview nulo já está em dia com o mapa', () => {
    expect(dragPreviewCaughtUp(layoutsOf(box('a', 0, 0)), null)).toBe(true);
  });

  it('posições do arraste só batem quando cada caixa já tem x/y gravados', () => {
    const layouts = layoutsOf(box('a', 10, 20), box('b', 80, 0));
    expect(dragPreviewCaughtUp(layouts, { positions: { a: { x: 10, y: 20 } } })).toBe(true);
    expect(dragPreviewCaughtUp(layouts, { positions: { a: { x: 10.4, y: 20.4 } } })).toBe(true);
    expect(dragPreviewCaughtUp(layouts, { positions: { a: { x: 11, y: 20 } } })).toBe(false);
  });

  it('resize só bate quando largura e altura já estão na caixa', () => {
    const layouts = layoutsOf(box('a', 0, 0));
    expect(dragPreviewCaughtUp(layouts, { nodeId: 'a', width: 40, height: 24 })).toBe(true);
    expect(dragPreviewCaughtUp(layouts, { nodeId: 'a', width: 120, height: 60 })).toBe(false);
  });

  it('preview de waypoint de cabo não é comparado com caixas de nó', () => {
    const layouts = layoutsOf(box('a', 0, 0));
    expect(
      dragPreviewCaughtUp(layouts, { linkWaypoints: { key: 'a->b', waypoints: [{ x: 1, y: 1 }] } })
    ).toBe(false);
  });
});
