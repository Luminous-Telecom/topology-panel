import { describe, expect, it } from 'vitest';
import { TopologyMap, TopologyNode, TopologyPanelOptions } from '../types';
import { emptyMap } from './testMapFixtures';
import {
  collectAllSubmapGroups,
  collectSubmapCatalogGroups,
  effectiveSubmapQueryRefIds,
  findSubmapNodeForChildMap,
  resolveCatalogGroupName,
  submapQueryRefIds,
  zabbixGroupsFromHostMetadata,
} from './queryHosts';

function submap(overrides: Partial<TopologyNode>): TopologyNode {
  return { id: 'sm', type: 'submap', x: 0, y: 0, ...overrides };
}

function panelOptions(
  map: TopologyMap,
  extras?: Pick<TopologyPanelOptions, 'childMaps'>
): Pick<TopologyPanelOptions, 'map' | 'childMaps'> {
  return { map, childMaps: extras?.childMaps };
}

describe('resolveCatalogGroupName', () => {
  it('casa queryRefId com o catálogo sem distinguir maiúsculas', () => {
    expect(resolveCatalogGroupName('BACKBONE', ['Backbone', 'Borda'])).toBe('Backbone');
    expect(resolveCatalogGroupName('borda', ['Backbone', 'Borda'])).toBe('Borda');
  });

  it('devolve undefined quando o grupo não está no catálogo', () => {
    expect(resolveCatalogGroupName('OUTRO', ['Backbone', 'Borda'])).toBeUndefined();
  });
});

describe('zabbixGroupsFromHostMetadata', () => {
  it('junta os grupos da metadata no casing do Zabbix', () => {
    expect(
      zabbixGroupsFromHostMetadata({
        'host-a': { name: 'host-a', hostGroups: ['Backbone', 'Borda'] },
        'host-b': { name: 'host-b', hostGroups: ['Backbone'] },
      })
    ).toEqual(['Backbone', 'Borda']);
  });

  it('devolve vazio quando ninguém tem grupo', () => {
    expect(zabbixGroupsFromHostMetadata({ 'host-a': { name: 'host-a' } })).toEqual([]);
  });
});

describe('submapQueryRefIds', () => {
  it('lê queryRefIds e ignora o campo legado', () => {
    expect(
      submapQueryRefIds(submap({ queryRefIds: ['Backbone', 'borda'], queryRefId: 'OUTRO' }))
    ).toEqual(['Backbone', 'borda']);
  });

  it('cai no queryRefId legado quando a lista está vazia', () => {
    expect(submapQueryRefIds(submap({ queryRefId: 'BACKBONE' }))).toEqual(['BACKBONE']);
  });

  it('deduplica grupos sem distinguir maiúsculas', () => {
    expect(submapQueryRefIds(submap({ queryRefIds: ['Backbone', 'BACKBONE', ' borda '] }))).toEqual([
      'Backbone',
      'borda',
    ]);
  });
});

describe('collectSubmapCatalogGroups', () => {
  it('deduplica o mesmo grupo em dois submapas', () => {
    const map = emptyMap({
      nodes: [submap({ id: 'a', queryRefId: 'BACKBONE' }), submap({ id: 'b', queryRefId: 'BACKBONE' })],
    });
    expect(collectSubmapCatalogGroups(map)).toEqual(['BACKBONE']);
  });
});

describe('collectAllSubmapGroups', () => {
  it('junta grupos da raiz e dos childMaps aninhados', () => {
    const root = emptyMap({
      nodes: [submap({ id: 'city-a', queryRefId: 'BACKBONE', submapChildMapId: 'city-a' })],
    });
    const childMaps = {
      'city-a': emptyMap({
        nodes: [submap({ id: 'inner', queryRefId: 'BORDA', submapChildMapId: 'city-b' })],
      }),
    };
    expect(collectAllSubmapGroups(panelOptions(root, { childMaps }))).toEqual(['BACKBONE', 'BORDA']);
  });
});

describe('findSubmapNodeForChildMap', () => {
  it('acha o nó pai no mapa raiz', () => {
    const parent = submap({ id: 'city', submapChildMapId: 'city-a', queryRefId: 'BACKBONE' });
    const root = emptyMap({ nodes: [parent] });
    expect(findSubmapNodeForChildMap(root, undefined, 'city-a')).toBe(parent);
  });

  it('acha o nó pai em cidade aninhada (childMaps)', () => {
    const nested = submap({ id: 'inner', submapChildMapId: 'city-b', queryRefId: 'BORDA' });
    const root = emptyMap({
      nodes: [submap({ id: 'outer', submapChildMapId: 'city-a', queryRefId: 'BACKBONE' })],
    });
    const childMaps = { 'city-a': emptyMap({ nodes: [nested] }) };
    expect(findSubmapNodeForChildMap(root, childMaps, 'city-b')).toBe(nested);
  });
});

describe('effectiveSubmapQueryRefIds', () => {
  it('junta o grupo do atalho com o do nó dono do mapa interno', () => {
    const owner = submap({ id: 'city-b', queryRefId: 'MAPA/B', submapChildMapId: 'city-b' });
    const shortcut = submap({ id: 'link-b', queryRefId: 'B', submapChildMapId: 'city-b' });
    const options = panelOptions(emptyMap({ nodes: [owner] }));
    expect(effectiveSubmapQueryRefIds(shortcut, options)).toEqual(['B', 'MAPA/B']);
  });

  it('não duplica quando o próprio nó é o dono do mapa', () => {
    const owner = submap({ id: 'city-b', queryRefId: 'MAPA/B', submapChildMapId: 'city-b' });
    const options = panelOptions(emptyMap({ nodes: [owner] }));
    expect(effectiveSubmapQueryRefIds(owner, options)).toEqual(['MAPA/B']);
  });
});
