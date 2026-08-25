import { describe, expect, it } from 'vitest';
import { TopologyLink, TopologyMap, TopologyNode, TopologyPanelOptions, defaultOptions } from '../types';
import { syncInterSubmapCounterpartLinks } from './interSubmapLinks';
import { emptyMap, hostNode } from './testMapFixtures';
import { ROOT_MAP_ID } from './topologyMapNavigation';
import { linksMatchEndpoints } from './mapLinkEdits';

function submapBox(id: string, childMapId: string, label: string): TopologyNode {
  return { id, type: 'submap', x: 0, y: 0, submapChildMapId: childMapId, label };
}

function host(id: string, ip: string, label: string): TopologyNode {
  return hostNode({ id, zabbixHost: ip, label });
}

function panel(root: TopologyMap, childMaps: Record<string, TopologyMap>): TopologyPanelOptions {
  return { ...defaultOptions(), map: root, childMaps };
}

function findLink(map: TopologyMap | undefined, from: string, to: string): TopologyLink | undefined {
  return map?.links.find((link) => linksMatchEndpoints(link, { from, to }));
}

const hostA = host('ha', '10.0.0.1', 'host-a');
const hostB = host('hb', '10.0.0.2', 'host-b');
const peerA = { nodeId: 'ha', zabbixHost: '10.0.0.1', label: 'host-a' };
const peerB = { nodeId: 'hb', zabbixHost: '10.0.0.2', label: 'host-b' };
const ifaceA = { name: 'eth-a', metrics: { rx: { key: 'vendor.metric.rx[10]' } } };
const ifaceB = { name: 'eth-b', metrics: { tx: { key: 'vendor.metric.tx[10]' } } };

function mapsWithBoxes() {
  const root = emptyMap({
    nodes: [submapBox('box-a', 'map-a', 'Mapa A'), submapBox('box-b', 'map-b', 'Mapa B')],
  });
  const mapA = emptyMap({
    nodes: [hostA, submapBox('to-b', 'map-b', 'Mapa B')],
  });
  const mapB = emptyMap({
    nodes: [hostB, submapBox('to-a', 'map-a', 'Mapa A')],
  });
  return panel(root, { 'map-a': mapA, 'map-b': mapB });
}

describe('syncInterSubmapCounterpartLinks', () => {
  it('dentro de um submapa, cria o cabo na raiz e o cabo no mapa de destino', () => {
    const options = mapsWithBoxes();
    const withLink = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              toPeerHost: peerB,
            },
          ],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(withLink, 'map-a', withLink.childMaps!['map-a']!.links[0]!);

    const rootLink = findLink(next.map, 'box-a', 'box-b');
    expect(rootLink?.fromPeerHost).toEqual(peerA);
    expect(rootLink?.toPeerHost).toEqual(peerB);
    expect(rootLink?.fromInterface).toEqual(ifaceA);
    expect(rootLink?.toInterface).toEqual(ifaceB);

    const destLink = findLink(next.childMaps?.['map-b'], 'hb', 'to-a');
    expect(destLink?.from).toBe('to-a');
    expect(destLink?.to).toBe('hb');
    expect(destLink?.fromInterface).toEqual(ifaceA);
    expect(destLink?.toInterface).toEqual(ifaceB);
    expect(destLink?.fromPeerHost).toEqual(peerA);

    expect(next.childMaps?.['map-a']?.links).toHaveLength(1);
  });

  it('na raiz, cria o cabo host↔caixa nos dois mapas internos', () => {
    const options = mapsWithBoxes();
    const withLink = {
      ...options,
      map: {
        ...options.map,
        links: [
          {
            from: 'box-a',
            to: 'box-b',
            fromPeerHost: peerA,
            toPeerHost: peerB,
            fromInterface: ifaceA,
            toInterface: ifaceB,
          },
        ],
      },
    };

    const next = syncInterSubmapCounterpartLinks(withLink, ROOT_MAP_ID, withLink.map.links[0]!);

    const originLink = findLink(next.childMaps?.['map-a'], 'ha', 'to-b');
    expect(originLink?.from).toBe('ha');
    expect(originLink?.to).toBe('to-b');
    expect(originLink?.toPeerHost).toEqual(peerB);

    const destLink = findLink(next.childMaps?.['map-b'], 'hb', 'to-a');
    expect(destLink?.from).toBe('to-a');
    expect(destLink?.to).toBe('hb');
    expect(destLink?.fromPeerHost).toEqual(peerA);
    expect(next.map.links).toHaveLength(1);
  });

  it('não cria cabo novo quando o par já existe — só atualiza interface e peer', () => {
    const options = mapsWithBoxes();
    const seeded = {
      ...options,
      map: {
        ...options.map,
        links: [{ from: 'box-b', to: 'box-a', fromPeerHost: peerB, toPeerHost: peerA }],
      },
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              toPeerHost: peerB,
            },
          ],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(seeded, 'map-a', seeded.childMaps!['map-a']!.links[0]!);
    expect(next.map.links).toHaveLength(1);
    expect(next.map.links[0]?.from).toBe('box-b');
    expect(next.map.links[0]?.fromInterface).toEqual(ifaceB);
    expect(next.map.links[0]?.toInterface).toEqual(ifaceA);
  });

  it('host para host no mesmo mapa não espelha cabo', () => {
    const options = mapsWithBoxes();
    const withLink = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          nodes: [hostA, host('hc', '10.0.0.3', 'host-c')],
          links: [{ from: 'ha', to: 'hc' }],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(withLink, 'map-a', withLink.childMaps!['map-a']!.links[0]!);
    expect(next.map.links).toEqual([]);
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('com várias caixas do mesmo mapa, liga a caixa da região ao host configurado', () => {
    const options = mapsWithBoxes();
    const withBoxes = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              toPeerHost: peerB,
            },
          ],
        },
        'map-b': emptyMap({
          nodes: [hostB, submapBox('to-a', 'map-a', 'map-a'), submapBox('to-a-host', 'map-a', 'host-a')],
        }),
      },
    };

    const next = syncInterSubmapCounterpartLinks(withBoxes, 'map-a', withBoxes.childMaps!['map-a']!.links[0]!);
    const destLink = findLink(next.childMaps?.['map-b'], 'hb', 'to-a');
    expect(destLink?.from).toBe('to-a');
    expect(destLink?.to).toBe('hb');
    expect(destLink?.fromPeerHost).toEqual(peerA);
    expect(findLink(next.childMaps?.['map-b'], 'hb', 'to-a-host')).toBeUndefined();
  });

  it('move o cabo da caixa de host para a caixa da região', () => {
    const options = mapsWithBoxes();
    const withWrongBox = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              toPeerHost: peerB,
            },
          ],
        },
        'map-b': emptyMap({
          nodes: [hostB, submapBox('to-a', 'map-a', 'map-a'), submapBox('to-a-host', 'map-a', 'host-a')],
          links: [{ from: 'hb', to: 'to-a-host', toPeerHost: peerA }],
        }),
      },
    };

    const next = syncInterSubmapCounterpartLinks(
      withWrongBox,
      'map-a',
      withWrongBox.childMaps!['map-a']!.links[0]!
    );
    const destLink = findLink(next.childMaps?.['map-b'], 'hb', 'to-a');
    expect(destLink?.from).toBe('to-a');
    expect(destLink?.to).toBe('hb');
    expect(destLink?.fromPeerHost).toEqual(peerA);
    expect(findLink(next.childMaps?.['map-b'], 'hb', 'to-a-host')).toBeUndefined();
  });

  it('caixa→host no mapa de destino espelha a seta para o destino', () => {
    const options = mapsWithBoxes();
    const withLink = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-b': {
          ...options.childMaps!['map-b']!,
          links: [
            {
              from: 'to-a',
              to: 'hb',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              fromPeerHost: peerA,
            },
          ],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(withLink, 'map-b', withLink.childMaps!['map-b']!.links[0]!);

    const rootLink = findLink(next.map, 'box-a', 'box-b');
    expect(rootLink?.from).toBe('box-a');
    expect(rootLink?.to).toBe('box-b');
    expect(rootLink?.fromPeerHost).toEqual(peerA);
    expect(rootLink?.toPeerHost).toEqual(peerB);
    expect(rootLink?.fromInterface).toEqual(ifaceA);
    expect(rootLink?.toInterface).toEqual(ifaceB);

    const originLink = findLink(next.childMaps?.['map-a'], 'ha', 'to-b');
    expect(originLink?.from).toBe('ha');
    expect(originLink?.to).toBe('to-b');
    expect(originLink?.toPeerHost).toEqual(peerB);
    expect(originLink?.fromInterface).toEqual(ifaceA);
    expect(originLink?.toInterface).toEqual(ifaceB);
    expect(next.childMaps?.['map-b']?.links).toHaveLength(1);
  });

  it('inverte o hop interno que apontava para a origem', () => {
    const options = mapsWithBoxes();
    const inverted = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceA,
              toInterface: ifaceB,
              toPeerHost: peerB,
            },
          ],
        },
        'map-b': {
          ...options.childMaps!['map-b']!,
          links: [{ from: 'hb', to: 'to-a', toPeerHost: peerA }],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(inverted, 'map-a', inverted.childMaps!['map-a']!.links[0]!);
    const destLink = findLink(next.childMaps?.['map-b'], 'hb', 'to-a');
    expect(destLink?.from).toBe('to-a');
    expect(destLink?.to).toBe('hb');
    expect(destLink?.fromPeerHost).toEqual(peerA);
    expect(destLink?.fromInterface).toEqual(ifaceA);
    expect(destLink?.toInterface).toEqual(ifaceB);
  });

  it('sem caixa do outro submapa no destino, só cria o cabo da raiz', () => {
    const options = mapsWithBoxes();
    const withoutBackBox = {
      ...options,
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          links: [{ from: 'ha', to: 'to-b', toPeerHost: peerB, fromInterface: ifaceA, toInterface: ifaceB }],
        },
        'map-b': emptyMap({ nodes: [hostB] }),
      },
    };

    const next = syncInterSubmapCounterpartLinks(
      withoutBackBox,
      'map-a',
      withoutBackBox.childMaps!['map-a']!.links[0]!
    );
    expect(findLink(next.map, 'box-a', 'box-b')).toBeDefined();
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });
});
