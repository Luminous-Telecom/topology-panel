import { describe, expect, it } from 'vitest';
import { TopologyMap, TopologyNode } from '../types';
import {
  addLinkToMap,
  linksMatchEndpoints,
  moveStoredNode,
  moveStoredNodesBulk,
  rebindZabbixHost,
  removeNodeFromMap,
  removeNodesFromMap,
  updateHostsIconBulk,
} from './mapEdits';

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

describe('removeNodeFromMap', () => {
  it('remove o nó e os links conectados a ele', () => {
    const map = emptyMap({
      nodes: [hostNode(), hostNode({ id: 'b' })],
      links: [{ from: 'a', to: 'b' }],
    });
    const next = removeNodeFromMap(map, 'a');
    expect(next.nodes.map((n) => n.id)).toEqual(['b']);
    expect(next.links).toHaveLength(0);
  });

  it('registra host da Query removido em hiddenHosts (não reaparece no próximo merge)', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1' })] });
    const next = removeNodeFromMap(map, 'a');
    expect(next.hiddenHosts).toContain('10.0.0.1');
  });

  it('não afeta hiddenHosts ao remover um nó que não é host', () => {
    const map = emptyMap({ nodes: [{ id: 'net-1', type: 'network', x: 0, y: 0 }] });
    const next = removeNodeFromMap(map, 'net-1');
    expect(next.hiddenHosts).toBeUndefined();
  });
});

describe('removeNodesFromMap', () => {
  it('sem nós para remover, retorna o mesmo mapa (sem cópia)', () => {
    const map = emptyMap();
    expect(removeNodesFromMap(map, [])).toBe(map);
  });

  it('remove vários nós de uma vez preservando os demais', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b' }), hostNode({ id: 'c' })] });
    const next = removeNodesFromMap(map, [hostNode(), hostNode({ id: 'b' })]);
    expect(next.nodes.map((n) => n.id)).toEqual(['c']);
  });
});

describe('moveStoredNode / moveStoredNodesBulk', () => {
  it('arredonda coordenadas e limpa networkId ao mover host manualmente', () => {
    const node = hostNode({ networkId: 'net-1' });
    const map = emptyMap({ nodes: [node] });
    const next = moveStoredNode(map, node, 12.6, 30.2);
    const moved = next.nodes.find((n) => n.id === 'a');
    expect(moved).toMatchObject({ x: 13, y: 30 });
    expect(moved?.networkId).toBeUndefined();
  });

  it('move vários nós de uma vez', () => {
    const map = emptyMap({ nodes: [hostNode(), hostNode({ id: 'b', x: 0, y: 0 })] });
    const next = moveStoredNodesBulk(map, [
      { nodeId: 'a', x: 100, y: 200 },
      { nodeId: 'b', x: 300, y: 400 },
    ]);
    expect(next.nodes.find((n) => n.id === 'a')).toMatchObject({ x: 100, y: 200 });
    expect(next.nodes.find((n) => n.id === 'b')).toMatchObject({ x: 300, y: 400 });
  });

  it('ignora ids não encontrados sem lançar erro', () => {
    const map = emptyMap({ nodes: [hostNode()] });
    expect(() => moveStoredNodesBulk(map, [{ nodeId: 'ghost', x: 1, y: 1 }])).not.toThrow();
  });
});

describe('updateHostsIconBulk', () => {
  it('sem ícone informado, retorna o mesmo mapa', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1' })] });
    expect(updateHostsIconBulk(map, map.nodes, undefined)).toBe(map);
  });

  it('aplica o ícone a todos os hosts selecionados vinculados à Query', () => {
    const map = emptyMap({
      nodes: [
        hostNode({ id: 'a', zabbixHost: '10.0.0.1' }),
        hostNode({ id: 'b', zabbixHost: '10.0.0.2' }),
      ],
    });
    const next = updateHostsIconBulk(map, map.nodes, 'switch_managed');
    expect(next.nodes.every((n) => n.icon === 'switch_managed')).toBe(true);
    expect(next.hostIcons?.['10.0.0.1']).toBe('switch_managed');
    expect(next.hostIcons?.['10.0.0.2']).toBe('switch_managed');
  });
});

describe('rebindZabbixHost', () => {
  it('ip inválido não altera o mapa', () => {
    const map = emptyMap({ nodes: [hostNode({ zabbixHost: '10.0.0.1', subtitle: '10.0.0.1' })] });
    expect(rebindZabbixHost(map, 'a', 'Novo nome', 'not-an-ip')).toBe(map);
  });

  it('troca o host vinculado mantendo o id do nó', () => {
    const map = emptyMap({
      nodes: [hostNode({ zabbixHost: '10.0.0.1', subtitle: '10.0.0.1', label: 'Antigo' })],
    });
    const next = rebindZabbixHost(map, 'a', 'Novo nome', '10.0.0.2');
    const rebound = next.nodes.find((n) => n.id === 'a');
    expect(rebound).toMatchObject({ zabbixHost: '10.0.0.2', subtitle: '10.0.0.2', label: 'Novo nome' });
  });
});
