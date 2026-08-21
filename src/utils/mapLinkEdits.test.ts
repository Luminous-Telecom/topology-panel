import { describe, expect, it } from 'vitest';
import { addLinkToMap, addLinkWithInterfaces, linksMatchEndpoints } from './mapLinkEdits';
import { emptyMap, hostNode } from './testMapFixtures';

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
    expect(next.links).toEqual([
      {
        from: 'a',
        to: 'b',
        medium: expect.any(String),
        discovery: { source: 'manual', state: 'confirmed', confirmed: true },
      },
    ]);
  });

  it('permite link manual sem interfaces (sem monitoramento de tráfego)', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' })] });
    const next = addLinkWithInterfaces(map, 'a', 'b');
    expect(next.links[0]?.fromInterface).toBeUndefined();
    expect(next.links[0]?.toInterface).toBeUndefined();
  });
});
