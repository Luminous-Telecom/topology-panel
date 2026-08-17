import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { buildDragGroupMembers, canMoveSelectedNode, defaultNodeSize, defaultResizeSize } from './dragState';
import { NodeLayout } from './nodeLayout';

function node(id: string, overrides?: Partial<TopologyNode>): TopologyNode {
  return { id, type: 'host', x: 10, y: 20, ...overrides };
}

describe('canMoveSelectedNode', () => {
  it('host se move mesmo com as redes travadas', () => {
    expect(canMoveSelectedNode(node('a'), true)).toBe(true);
  });

  it('caixa de rede não se move com as redes travadas', () => {
    expect(canMoveSelectedNode(node('r', { type: 'network' }), true)).toBe(false);
  });
});

describe('defaultNodeSize / defaultResizeSize', () => {
  it('submapa arrastado usa o tamanho de host, mas redimensionado usa o tamanho próprio', () => {
    expect(defaultNodeSize(node('s', { type: 'submap' }))).toEqual({ w: 48, h: 28 });
    expect(defaultResizeSize(node('s', { type: 'submap' }))).toEqual({ w: 120, h: 36 });
  });
});

describe('buildDragGroupMembers', () => {
  const nodes = [node('a'), node('b', { x: 100, y: 100 }), node('r', { type: 'network' })];

  it('congela a posição inicial de cada membro selecionado', () => {
    const members = buildDragGroupMembers(['a', 'b'], nodes, new Map(), false);
    expect(members.map((m) => [m.id, m.startX, m.startY])).toEqual([
      ['a', 10, 20],
      ['b', 100, 100],
    ]);
  });

  it('deixa a rede de fora quando as redes estão travadas', () => {
    const members = buildDragGroupMembers(['a', 'r'], nodes, new Map(), true);
    expect(members.map((m) => m.id)).toEqual(['a']);
  });

  it('ignora id selecionado que não existe mais no mapa', () => {
    expect(buildDragGroupMembers(['sumiu'], nodes, new Map(), false)).toEqual([]);
  });

  it('prefere o tamanho medido no layout ao tamanho padrão', () => {
    const nodeLayouts = new Map<string, NodeLayout & TopologyNode>([
      ['a', { ...node('a'), w: 77, h: 33, label: 'a', labelFontSize: 12, subFontSize: 10, labelY: 10 }],
    ]);
    const [member] = buildDragGroupMembers(['a'], nodes, nodeLayouts, false);
    expect([member.startW, member.startH]).toEqual([77, 33]);
  });
});
