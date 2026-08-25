import { describe, expect, it } from 'vitest';
import { TopologyLink, TopologyMap, TopologyNode, TopologyPanelOptions, defaultOptions } from '../types';
import {
  removeInterSubmapCounterpartLinks,
  removeMissingInterSubmapCounterparts,
  syncInterSubmapCounterpartLinks,
} from './interSubmapLinks';
import { emptyMap, hostNode } from './testMapFixtures';
import { applyTopologyMapToPanelOptions, ROOT_MAP_ID } from './topologyMapNavigation';
import { linksMatchEndpoints, removeLink } from './mapLinkEdits';
import { removeNodeFromMap } from './mapEdits';

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

  it('espelha segundo cabo do mesmo host quando as interfaces diferem', () => {
    const synced = fullySyncedFromOrigin();
    const ifaceC = { name: 'eth-c' };
    const ifaceD = { name: 'eth-d' };
    const withSecond = {
      ...synced,
      childMaps: {
        ...synced.childMaps,
        'map-a': {
          ...synced.childMaps!['map-a']!,
          links: [
            ...synced.childMaps!['map-a']!.links,
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceC,
              toInterface: ifaceD,
              toPeerHost: peerB,
            },
          ],
        },
      },
    };

    const next = syncInterSubmapCounterpartLinks(
      withSecond,
      'map-a',
      withSecond.childMaps!['map-a']!.links[1]!
    );

    expect(next.map.links).toHaveLength(2);
    expect(next.childMaps?.['map-a']?.links).toHaveLength(2);
    expect(next.childMaps?.['map-b']?.links).toHaveLength(2);
    expect(
      next.map.links.some((link) => link.fromInterface?.name === 'eth-c' || link.toInterface?.name === 'eth-c')
    ).toBe(true);
  });
});

function fullySyncedFromOrigin(): TopologyPanelOptions {
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
  return syncInterSubmapCounterpartLinks(withLink, 'map-a', withLink.childMaps!['map-a']!.links[0]!);
}

function currentMapOf(options: TopologyPanelOptions, mapId: string): TopologyMap | undefined {
  if (mapId === ROOT_MAP_ID) {
    return options.map;
  }
  return options.childMaps?.[mapId];
}

function deleteLinkOnMap(
  options: TopologyPanelOptions,
  mapId: string,
  from: string,
  to: string
): TopologyPanelOptions {
  const current = currentMapOf(options, mapId);
  if (!current) {
    throw new Error(`mapa ausente: ${mapId}`);
  }
  const link = findLink(current, from, to);
  if (!link) {
    throw new Error(`cabo ausente: ${from}-${to}`);
  }
  const without = removeLink(current, link);
  const base = applyTopologyMapToPanelOptions(options, mapId, without);
  return removeInterSubmapCounterpartLinks(base, mapId, link);
}

describe('removeInterSubmapCounterpartLinks', () => {
  it('ao excluir o hop de origem, remove o cabo da raiz e o hop no mapa de destino', () => {
    const next = deleteLinkOnMap(fullySyncedFromOrigin(), 'map-a', 'ha', 'to-b');

    expect(next.childMaps?.['map-a']?.links).toEqual([]);
    expect(findLink(next.map, 'box-a', 'box-b')).toBeUndefined();
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('ao excluir o hop de destino, remove o cabo da raiz e o hop no mapa de origem', () => {
    const next = deleteLinkOnMap(fullySyncedFromOrigin(), 'map-b', 'to-a', 'hb');

    expect(next.childMaps?.['map-b']?.links).toEqual([]);
    expect(findLink(next.map, 'box-a', 'box-b')).toBeUndefined();
    expect(next.childMaps?.['map-a']?.links).toEqual([]);
  });

  it('ao excluir o cabo na raiz, remove os hops internos nos dois submapas', () => {
    const next = deleteLinkOnMap(fullySyncedFromOrigin(), ROOT_MAP_ID, 'box-a', 'box-b');

    expect(next.map.links).toEqual([]);
    expect(next.childMaps?.['map-a']?.links).toEqual([]);
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('host para host no mesmo mapa não remove cabos dos outros mapas', () => {
    const options = mapsWithBoxes();
    const withLocal = {
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
      childMaps: {
        ...options.childMaps,
        'map-a': {
          ...options.childMaps!['map-a']!,
          nodes: [hostA, host('hc', '10.0.0.3', 'host-c')],
          links: [{ from: 'ha', to: 'hc' }],
        },
      },
    };

    const next = deleteLinkOnMap(withLocal, 'map-a', 'ha', 'hc');
    expect(findLink(next.map, 'box-a', 'box-b')).toBeDefined();
    expect(next.childMaps?.['map-a']?.links).toEqual([]);
  });

  it('não remove hop de outro host entre os mesmos submapas', () => {
    const hostC = host('hc', '10.0.0.3', 'host-c');
    const hostD = host('hd', '10.0.0.4', 'host-d');
    const peerC = { nodeId: 'hc', zabbixHost: '10.0.0.3', label: 'host-c' };
    const peerD = { nodeId: 'hd', zabbixHost: '10.0.0.4', label: 'host-d' };
    const ifaceC = { name: 'eth-c' };
    const ifaceD = { name: 'eth-d' };
    const synced = fullySyncedFromOrigin();
    const withSecond = {
      ...synced,
      childMaps: {
        ...synced.childMaps,
        'map-a': {
          ...synced.childMaps!['map-a']!,
          nodes: [...synced.childMaps!['map-a']!.nodes, hostC],
          links: [
            ...synced.childMaps!['map-a']!.links,
            {
              from: 'hc',
              to: 'to-b',
              fromInterface: ifaceC,
              toInterface: ifaceD,
              toPeerHost: peerD,
            },
          ],
        },
        'map-b': {
          ...synced.childMaps!['map-b']!,
          nodes: [...synced.childMaps!['map-b']!.nodes, hostD],
          links: [
            ...synced.childMaps!['map-b']!.links,
            {
              from: 'to-a',
              to: 'hd',
              fromInterface: ifaceC,
              toInterface: ifaceD,
              fromPeerHost: peerC,
            },
          ],
        },
      },
    };

    const next = deleteLinkOnMap(withSecond, 'map-a', 'ha', 'to-b');
    expect(findLink(next.childMaps?.['map-a'], 'hc', 'to-b')).toBeDefined();
    expect(findLink(next.childMaps?.['map-b'], 'hd', 'to-a')).toBeDefined();
    expect(findLink(next.childMaps?.['map-b'], 'hb', 'to-a')).toBeUndefined();
  });

  it('remove hop órfão no destino mesmo sem interface gravada', () => {
    const options = mapsWithBoxes();
    const withOrphan = {
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
          links: [{ from: 'to-a', to: 'hb' }],
        },
      },
    };

    const next = deleteLinkOnMap(withOrphan, 'map-a', 'ha', 'to-b');
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('remove hop invertido no destino que aponta para a mesma interface', () => {
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
          links: [
            {
              from: 'hb',
              to: 'to-a',
              fromInterface: ifaceB,
              toInterface: ifaceA,
              toPeerHost: peerA,
            },
          ],
        },
      },
    };

    const next = deleteLinkOnMap(inverted, 'map-a', 'ha', 'to-b');
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('depois da exclusão nenhum cabo restante referencia as interfaces da conexão', () => {
    const next = deleteLinkOnMap(fullySyncedFromOrigin(), 'map-a', 'ha', 'to-b');
    const remaining = [
      ...(next.map.links ?? []),
      ...(next.childMaps?.['map-a']?.links ?? []),
      ...(next.childMaps?.['map-b']?.links ?? []),
    ];
    expect(
      remaining.some(
        (link) =>
          link.fromInterface?.name === ifaceA.name ||
          link.toInterface?.name === ifaceA.name ||
          link.fromInterface?.name === ifaceB.name ||
          link.toInterface?.name === ifaceB.name
      )
    ).toBe(false);
  });

  it('ao excluir um cabo paralelo, preserva o outro entre os mesmos submapas', () => {
    const synced = fullySyncedFromOrigin();
    const ifaceC = { name: 'eth-c' };
    const ifaceD = { name: 'eth-d' };
    const withSecondHop = {
      ...synced,
      childMaps: {
        ...synced.childMaps,
        'map-a': {
          ...synced.childMaps!['map-a']!,
          links: [
            ...synced.childMaps!['map-a']!.links,
            {
              from: 'ha',
              to: 'to-b',
              fromInterface: ifaceC,
              toInterface: ifaceD,
              toPeerHost: peerB,
            },
          ],
        },
      },
    };
    const dual = syncInterSubmapCounterpartLinks(
      withSecondHop,
      'map-a',
      withSecondHop.childMaps!['map-a']!.links[1]!
    );

    const next = deleteLinkOnMap(dual, 'map-a', 'ha', 'to-b');

    expect(next.childMaps?.['map-a']?.links).toHaveLength(1);
    expect(next.childMaps?.['map-a']?.links[0]?.fromInterface?.name).toBe('eth-c');
    expect(next.map.links).toHaveLength(1);
    expect(next.childMaps?.['map-b']?.links).toHaveLength(1);
  });
});

describe('removeMissingInterSubmapCounterparts', () => {
  it('detecta o cabo removido do mapa ativo e limpa os espelhos', () => {
    const synced = fullySyncedFromOrigin();
    const previous = synced.childMaps!['map-a']!;
    const current = removeLink(previous, previous.links[0]!);
    const base = applyTopologyMapToPanelOptions(synced, 'map-a', current);
    const next = removeMissingInterSubmapCounterparts(base, 'map-a', previous, current);

    expect(next.childMaps?.['map-a']?.links).toEqual([]);
    expect(findLink(next.map, 'box-a', 'box-b')).toBeUndefined();
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });

  it('não altera os outros mapas quando o cabo ainda existe', () => {
    const synced = fullySyncedFromOrigin();
    const current = synced.childMaps!['map-a']!;
    const next = removeMissingInterSubmapCounterparts(synced, 'map-a', current, current);
    expect(findLink(next.map, 'box-a', 'box-b')).toBeDefined();
    expect(findLink(next.childMaps?.['map-b'], 'hb', 'to-a')).toBeDefined();
  });

  it('ao excluir o host de origem, limpa o cabo da raiz e o hop no destino', () => {
    const synced = fullySyncedFromOrigin();
    const previous = synced.childMaps!['map-a']!;
    const current = removeNodeFromMap(previous, 'ha');
    const base = applyTopologyMapToPanelOptions(synced, 'map-a', current);
    const next = removeMissingInterSubmapCounterparts(base, 'map-a', previous, current);

    expect(findLink(next.map, 'box-a', 'box-b')).toBeUndefined();
    expect(next.childMaps?.['map-b']?.links).toEqual([]);
  });
});
