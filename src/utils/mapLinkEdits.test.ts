import { describe, expect, it } from 'vitest';
import { TopologyMap, TopologyNode } from '../types';
import { addLinkToMap, linksMatchEndpoints } from './mapLinkEdits';

function emptyMap(overrides?: Partial<TopologyMap>): TopologyMap {
  return { width: 800, height: 600, nodes: [], links: [], ...overrides };
}

function hostNode(overrides?: Partial<TopologyNode>): TopologyNode {
  return { id: 'a', type: 'host', x: 10, y: 10, ...overrides };
}

describe('linksMatchEndpoints', () => {
  it('considera a→b igual a b→a', () => {
    expect(linksMatchEndpoints({ from: 'a', to: 'b' }, { from: 'b', to: 'a' })).toBe(true);
  });

  it('não confunde links sem relação', () => {
    expect(linksMatchEndpoints({ from: 'a', to: 'b' }, { from: 'a', to: 'c' })).toBe(false);
  });
});

describe('addLinkToMap', () => {
  it('ignora link para o próprio nó', () => {
    const map = emptyMap({ nodes: [hostNode()] });
    expect(addLinkToMap(map, 'a', 'a')).toBe(map);
  });

  it('não duplica link já existente em qualquer direção', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'b' })],
      links: [{ from: 'a', to: 'b' }],
    });
    const next = addLinkToMap(map, 'b', 'a');
    expect(next.links).toHaveLength(1);
  });

  it('adiciona link novo entre dois nós existentes', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' })] });
    const next = addLinkToMap(map, 'a', 'b');
    expect(next.links).toEqual([{ from: 'a', to: 'b', medium: expect.any(String) }]);
  });
});
