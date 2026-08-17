import { describe, expect, it } from 'vitest';
import { HostDisplayMap, TopologyMap, TopologyNode } from '../types';
import { parentMapHostKeys, submapHostListForNode } from './submapHosts';

function map(nodes: TopologyNode[]): TopologyMap {
  return { width: 800, height: 600, nodes, links: [] };
}

function submap(queryRefId?: string): TopologyNode {
  return { id: 'sm', type: 'submap', x: 0, y: 0, queryRefId };
}

const display: Record<string, HostDisplayMap> = {
  B: {
    '10.0.0.1': { status: 'online', color: '#0f0', value: 1 },
    '10.0.0.2': { status: 'offline', color: '#f00', value: 0 },
  },
};

describe('parentMapHostKeys', () => {
  it('coleta só hosts, em minúsculas', () => {
    const keys = parentMapHostKeys(
      map([
        { id: 'a', type: 'host', x: 0, y: 0, zabbixHost: 'RB-01' },
        { id: 'r', type: 'network', x: 0, y: 0 },
      ])
    );
    expect([...keys]).toEqual(['rb-01']);
  });

  it('mapa sem host devolve conjunto vazio', () => {
    expect(parentMapHostKeys(map([]))).toEqual(new Set());
  });
});

describe('submapHostListForNode', () => {
  it('submapa sem consulta não agrega host nenhum', () => {
    expect(submapHostListForNode(submap(), {}, {}, true, new Set())).toEqual([]);
  });

  it('devolve undefined enquanto a Query não respondeu — evita status falso', () => {
    expect(submapHostListForNode(submap('B'), display, {}, false, new Set())).toBeUndefined();
  });

  it('usa os hosts do refId, ignorando maiúsculas e minúsculas', () => {
    expect(submapHostListForNode(submap('b'), display, {}, true, new Set())).toEqual([
      '10.0.0.1',
      '10.0.0.2',
    ]);
  });

  it('não conta host que já é nó do mapa pai', () => {
    const parents = new Set(['10.0.0.1']);
    expect(submapHostListForNode(submap('B'), display, {}, true, parents)).toEqual(['10.0.0.2']);
  });

  it('prefere a lista de labels da Query ao bucket de status', () => {
    const hosts = { B: ['10.0.0.9'] };
    expect(submapHostListForNode(submap('B'), display, hosts, true, new Set())).toEqual(['10.0.0.9']);
  });
});
