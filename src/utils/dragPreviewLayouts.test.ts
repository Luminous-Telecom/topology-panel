import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { applyDragPreviewToLayouts, LayoutMap } from './dragPreviewLayouts';
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
