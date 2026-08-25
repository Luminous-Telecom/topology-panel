import { describe, expect, it } from 'vitest';
import { HostDisplayMap, TopologyMap, TopologyNode } from '../types';
import {
  findSubmapNodeByChildMapId,
  pickCounterpartSubmapBox,
  innerHostsForSubmapNode,
  linkPeerHostFromNode,
  parentMapHostKeys,
  resolveInnerHost,
  shouldOpenLinkInterfaceModal,
  submapHostListForNode,
} from './submapHosts';

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

  it('junta hosts de vários grupos do mesmo submapa', () => {
    const node: TopologyNode = {
      id: 'sm',
      type: 'submap',
      x: 0,
      y: 0,
      queryRefIds: ['B', 'C'],
    };
    const hosts = { B: ['10.0.0.1'], C: ['10.0.0.3'] };
    expect(submapHostListForNode(node, display, hosts, true, new Set())).toEqual(['10.0.0.1', '10.0.0.3']);
  });
});

describe('innerHostsForSubmapNode / shouldOpenLinkInterfaceModal', () => {
  const innerA = { id: 'ha', type: 'host' as const, x: 0, y: 0, zabbixHost: '10.0.0.1', label: 'host-a' };
  const innerB = { id: 'hb', type: 'host' as const, x: 1, y: 0, zabbixHost: '10.0.0.2', label: 'host-b' };
  const childMaps = { filial: map([innerA, innerB, { id: 'net', type: 'network' as const, x: 0, y: 0 }]) };
  const box = { id: 'sm', type: 'submap' as const, x: 0, y: 0, submapChildMapId: 'filial', label: 'Filial' };
  const parentHost = { id: 'sw', type: 'host' as const, x: 0, y: 0, zabbixHost: '10.0.0.9', label: 'host-sw' };

  it('lista só hosts do mapa interno', () => {
    expect(innerHostsForSubmapNode(box, childMaps).map((n) => n.id)).toEqual(['ha', 'hb']);
  });

  it('abre o modal ao ligar host do pai com submapa que tem host interno', () => {
    expect(shouldOpenLinkInterfaceModal(parentHost, box, childMaps, false)).toBe(true);
  });

  it('host–host sem Zabbix não abre o modal', () => {
    expect(shouldOpenLinkInterfaceModal(parentHost, innerA, {}, false)).toBe(false);
    expect(shouldOpenLinkInterfaceModal(parentHost, innerA, {}, true)).toBe(true);
  });

  it('resolve o host interno pelo peer gravado no cabo', () => {
    const peer = linkPeerHostFromNode(innerB);
    expect(resolveInnerHost([innerA, innerB], peer)?.id).toBe('hb');
  });

  it('acha a caixa do mapa interno neste mapa', () => {
    expect(findSubmapNodeByChildMapId(map([box]), 'filial')?.id).toBe('sm');
    expect(findSubmapNodeByChildMapId(map([box]), 'outro')).toBeUndefined();
  });

  it('escolhe a caixa da região, não a batizada com host', () => {
    const generic = { ...box, id: 'sm-generic', label: 'Filial' };
    const named = { ...box, id: 'sm-host', label: 'host-a' };
    const picked = pickCounterpartSubmapBox([named, generic], 'filial');
    expect(picked?.id).toBe('sm-generic');
  });
});
