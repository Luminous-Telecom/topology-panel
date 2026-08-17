import { describe, expect, it } from 'vitest';
import { TopologyNode } from '../types';
import { NodeLayout } from './nodeLayout';
import { nodesInMarquee, normalizeRect, rectsOverlap } from './marqueeSelection';

function node(id: string, type?: TopologyNode['type']): TopologyNode {
  return { id, type: type ?? 'host', x: 0, y: 0 };
}

function layouts(entries: Array<[string, { x: number; y: number; w: number; h: number }]>) {
  const map = new Map<string, NodeLayout & TopologyNode>();
  for (const [id, box] of entries) {
    map.set(id, {
      ...node(id),
      ...box,
      label: id,
      labelFontSize: 12,
      subFontSize: 10,
      labelY: 10,
    } as NodeLayout & TopologyNode);
  }
  return map;
}

describe('normalizeRect', () => {
  it('aceita arrasto da direita para a esquerda', () => {
    expect(normalizeRect(100, 80, 20, 10)).toEqual({ x: 20, y: 10, w: 80, h: 70 });
  });

  it('clique sem arrasto vira retângulo de área zero', () => {
    expect(normalizeRect(50, 50, 50, 50)).toEqual({ x: 50, y: 50, w: 0, h: 0 });
  });
});

describe('rectsOverlap', () => {
  it('detecta sobreposição parcial', () => {
    expect(rectsOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  it('encostar apenas na borda não conta como sobreposição', () => {
    expect(rectsOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });
});

describe('nodesInMarquee', () => {
  const nodes = [node('a'), node('b'), node('rede', 'network')];
  const nodeLayouts = layouts([
    ['a', { x: 0, y: 0, w: 20, h: 20 }],
    ['b', { x: 200, y: 200, w: 20, h: 20 }],
    ['rede', { x: 0, y: 0, w: 300, h: 300 }],
  ]);

  it('seleciona só quem a caixa encosta', () => {
    const ids = nodesInMarquee({ x: -5, y: -5, w: 40, h: 40 }, nodes, nodeLayouts, true);
    expect(ids).toEqual(['a']);
  });

  it('ignora caixa de rede enquanto as redes estão travadas', () => {
    const ids = nodesInMarquee({ x: 0, y: 0, w: 300, h: 300 }, nodes, nodeLayouts, true);
    expect(ids).toEqual(['a', 'b']);
  });

  it('inclui caixa de rede quando as redes estão destravadas', () => {
    const ids = nodesInMarquee({ x: 0, y: 0, w: 300, h: 300 }, nodes, nodeLayouts, false);
    expect(ids).toEqual(['a', 'b', 'rede']);
  });

  it('ignora nó sem layout medido', () => {
    const semLayout = [...nodes, node('fantasma')];
    const ids = nodesInMarquee({ x: -5, y: -5, w: 40, h: 40 }, semLayout, nodeLayouts, true);
    expect(ids).not.toContain('fantasma');
  });
});
